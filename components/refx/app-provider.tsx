'use client'

import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '@/lib/stores/ui-store'
import { useRuntimeActions, useRuntimeState } from '@/lib/stores/runtime-store'
import {
  getBaseThemeMode,
  getThemeAccentVariant,
  loadAppSettings,
  saveAppSettings,
  SPLASH_LOCALE_STORAGE_KEY,
  type StoredAppSettings,
} from '@/lib/app-settings'
import * as repo from '@/lib/repositories/local-db'
import { useTheme } from 'next-themes'
import { AppUpdateDialog } from '@/components/refx/app-update-dialog'
import { AppTourProvider } from '@/components/refx/app-tour-provider'
import { AppLoadingScreen } from '@/components/refx/app-loading-screen'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { APP_LOCALES, LocaleProvider, translate, type AppLocale } from '@/lib/localization'
import { APP_TOUR_ENABLED } from '@/lib/app-tour'
import {
  checkForAppUpdate,
  dismissPendingAppUpdate,
  downloadAndInstallAppUpdate,
  type AppUpdateSummary,
} from '@/lib/services/app-update-service'
import { getCurrentWindow, isTauri, WebviewWindow } from '@/lib/tauri/client'

interface AppProviderProps {
  children: React.ReactNode
}

const DEBUG_LOADING_SPLASH_UNTIL_KEY = 'refx.debug.loading-splash-until'

export function AppProvider({ children }: AppProviderProps) {
  const [isUiPrefsReady, setIsUiPrefsReady] = useState(false)
  const [isSettingsReady, setIsSettingsReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [appSettings, setAppSettings] = useState<StoredAppSettings | null>(null)
  const [isNameDialogOpen, setIsNameDialogOpen] = useState(false)
  const [isWelcomeFlowResolved, setIsWelcomeFlowResolved] = useState(false)
  const [draftUserName, setDraftUserName] = useState('')
  const [dontAskNameAgain, setDontAskNameAgain] = useState(false)
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdateSummary | null>(null)
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false)
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false)
  const [updateInstallStatus, setUpdateInstallStatus] = useState<string | null>(null)
  const [debugSplashUntil, setDebugSplashUntil] = useState<number | null>(null)
  const hasRevealedDesktopWindow = useRef(false)
  const { initialize } = useRuntimeActions()
  const { initialized, isDesktopApp } = useRuntimeState()
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed)
  const setSidebarCollapsed = useUiStore((state) => state.setSidebarCollapsed)
  const { setTheme } = useTheme()

  useEffect(() => {
    const init = async () => {
      try {
        await initialize()
      } catch (error) {
        console.error('Failed to initialize app:', error)
      } finally {
        setIsLoading(false)
      }
    }

    init()
  }, [initialize])

  useEffect(() => {
    if (!initialized) return

    const applySettings = async () => {
      const settings = await loadAppSettings(isDesktopApp)
      setAppSettings(settings)
      window.localStorage.setItem(SPLASH_LOCALE_STORAGE_KEY, settings.locale)
      setDraftUserName(settings.userName)
      setDontAskNameAgain(settings.skipNamePrompt)
      const shouldAskForName = !settings.userName.trim() && !settings.skipNamePrompt
      setIsNameDialogOpen(shouldAskForName)
      setIsWelcomeFlowResolved(!shouldAskForName)
      setTheme(getBaseThemeMode(settings.theme))
      const accentVariant = getThemeAccentVariant(settings.theme)
      if (accentVariant) {
        document.documentElement.dataset.refxAccent = accentVariant
      } else {
        delete document.documentElement.dataset.refxAccent
      }
      document.documentElement.style.fontSize = `${settings.fontSize}px`

      if (isDesktopApp && settings.autoBackupEnabled) {
        void repo.runScheduledBackupIfDue(
          settings.autoBackupScope,
          Number(settings.autoBackupIntervalDays),
          Number(settings.autoBackupKeepCount),
        ).catch((error) => {
          console.error('Automatic backup failed:', error)
        })
      }

      setIsSettingsReady(true)
    }

    void applySettings()
  }, [initialized, isDesktopApp, setTheme])

  useEffect(() => {
    if (!initialized || !isDesktopApp || !appSettings?.autoCheckForUpdates) return

    let cancelled = false

    const runUpdateCheck = async () => {
      try {
        const result = await checkForAppUpdate()
        if (!result.supported || !result.update || cancelled || typeof window === 'undefined') return

        const dismissedKey = `refx.update.dismissed.${result.update.version}`
        if (window.sessionStorage.getItem(dismissedKey) === 'true') return

        setAvailableUpdate(result.update)
        setUpdateInstallStatus(null)
        setIsUpdateDialogOpen(true)
      } catch (error) {
        console.warn('Automatic update check failed:', error)
      }
    }

    void runUpdateCheck()

    return () => {
      cancelled = true
    }
  }, [appSettings?.autoCheckForUpdates, initialized, isDesktopApp])

  useEffect(() => {
    if (!isUpdateDialogOpen || !isDesktopApp || !isTauri()) return

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const currentWindow = getCurrentWindow()
          const isMinimized = await currentWindow.isMinimized().catch(() => false)
          if (isMinimized) {
            await currentWindow.unminimize().catch(() => undefined)
          }
          await currentWindow.show().catch(() => undefined)
          await currentWindow.setFocus().catch(() => undefined)
        } catch (error) {
          console.warn('Failed to bring update dialog window to front:', error)
        }
      })()
    }, 40)

    return () => window.clearTimeout(timeoutId)
  }, [isDesktopApp, isUpdateDialogOpen])

  const handleUpdateDialogOpenChange = (open: boolean) => {
    setIsUpdateDialogOpen(open)
    if (!open && availableUpdate && typeof window !== 'undefined') {
      window.sessionStorage.setItem(`refx.update.dismissed.${availableUpdate.version}`, 'true')
      dismissPendingAppUpdate()
    }
  }

  const handleInstallUpdate = async () => {
    if (!availableUpdate) return

    setIsInstallingUpdate(true)
    setUpdateInstallStatus(translate(appSettings?.locale ?? 'en', 'settings.preparingUpdate'))
    try {
      await downloadAndInstallAppUpdate((messageKey, params) => {
        const locale = appSettings?.locale ?? 'en'
        const translatedMessage = translate(locale, messageKey, params)
        setUpdateInstallStatus(translatedMessage)
      })
    } catch (error) {
      console.error('Failed to install app update:', error)
      setUpdateInstallStatus(
        error instanceof Error
          ? error.message
          : translate(appSettings?.locale ?? 'en', 'settings.updateInstallFailed'),
      )
      setIsInstallingUpdate(false)
    }
  }

  const handleSaveUserName = async () => {
    const trimmed = draftUserName.trim()
    if (!trimmed || !appSettings) return

    const nextSettings = { ...appSettings, userName: trimmed, skipNamePrompt: false }
    setAppSettings(nextSettings)
    setDontAskNameAgain(false)
    await saveAppSettings(isDesktopApp, nextSettings)
    setIsWelcomeFlowResolved(true)
    setIsNameDialogOpen(false)
  }

  const handleSkipNamePrompt = async () => {
    if (!appSettings) return

    const nextSettings = { ...appSettings, userName: '', skipNamePrompt: true }
    setAppSettings(nextSettings)
    setDontAskNameAgain(true)
    await saveAppSettings(isDesktopApp, nextSettings)
    setIsWelcomeFlowResolved(true)
    setIsNameDialogOpen(false)
  }

  const handleWelcomeLocaleChange = (nextLocale: AppLocale) => {
    setAppSettings((current) => (current ? { ...current, locale: nextLocale } : current))
  }

  const handleMarkTourCompleted = async () => {
    if (!appSettings || appSettings.hasCompletedAppTour) return
    const nextSettings = { ...appSettings, hasCompletedAppTour: true }
    setAppSettings(nextSettings)
    await saveAppSettings(isDesktopApp, nextSettings)
  }

  useEffect(() => {
    if (!initialized || typeof window === 'undefined') return

    const stored = window.localStorage.getItem('refx.ui.sidebar-collapsed')
    if (stored !== null) {
      setSidebarCollapsed(stored === 'true')
    }
    setIsUiPrefsReady(true)
  }, [initialized, setSidebarCollapsed])

  useEffect(() => {
    if (!initialized || !isUiPrefsReady || typeof window === 'undefined') return
    window.localStorage.setItem('refx.ui.sidebar-collapsed', String(sidebarCollapsed))
  }, [initialized, isUiPrefsReady, sidebarCollapsed])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = window.sessionStorage.getItem(DEBUG_LOADING_SPLASH_UNTIL_KEY)
    if (!raw) return
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isFinite(parsed) || parsed <= Date.now()) {
      window.sessionStorage.removeItem(DEBUG_LOADING_SPLASH_UNTIL_KEY)
      return
    }

    setDebugSplashUntil(parsed)

    const timeoutId = window.setTimeout(() => {
      window.sessionStorage.removeItem(DEBUG_LOADING_SPLASH_UNTIL_KEY)
      setDebugSplashUntil(null)
    }, Math.max(0, parsed - Date.now()))

    return () => window.clearTimeout(timeoutId)
  }, [])

  const isDebugSplashActive = debugSplashUntil !== null && debugSplashUntil > Date.now()
  const shouldShowLoadingScreen = isLoading || !initialized || !isUiPrefsReady || !isSettingsReady || isDebugSplashActive

  useEffect(() => {
    if (!isDesktopApp || !isTauri() || shouldShowLoadingScreen || hasRevealedDesktopWindow.current) return

    hasRevealedDesktopWindow.current = true

    void (async () => {
      try {
        const currentWindow = getCurrentWindow()
        await currentWindow.show()
        await currentWindow.setFocus().catch(() => undefined)

        const splashWindow = await WebviewWindow.getByLabel('splash')
        if (splashWindow) {
          await splashWindow.close().catch(() => undefined)
        }
      } catch (error) {
        hasRevealedDesktopWindow.current = false
        console.warn('Failed to reveal main window after startup:', error)
      }
    })()
  }, [isDesktopApp, shouldShowLoadingScreen])

  if (shouldShowLoadingScreen) {
    const locale = appSettings?.locale ?? 'en'
    return (
      <AppLoadingScreen
        compact
        locale={locale}
        className="min-h-screen bg-[radial-gradient(circle_at_top,#dbeafe_0%,#f8fafc_34%,#eef2ff_100%)] dark:bg-[radial-gradient(circle_at_top,#1d2841_0%,#0f172a_36%,#09090b_100%)]"
      />
    )
  }

  const locale = appSettings?.locale ?? 'en'
  return (
    <LocaleProvider initialLocale={locale}>
      <AppTourProvider
        enabled={Boolean(APP_TOUR_ENABLED && !isNameDialogOpen)}
        shouldAutostart={Boolean(APP_TOUR_ENABLED && isWelcomeFlowResolved && !isNameDialogOpen && appSettings && !appSettings.hasCompletedAppTour)}
        onTourCompleted={handleMarkTourCompleted}
      >
        {!isNameDialogOpen ? children : null}
      </AppTourProvider>
      <AppUpdateDialog
        open={isUpdateDialogOpen}
        onOpenChange={handleUpdateDialogOpenChange}
        update={availableUpdate}
        isInstalling={isInstallingUpdate}
        installStatus={updateInstallStatus}
        onInstall={() => void handleInstallUpdate()}
        locale={locale}
      />
      <Dialog open={isNameDialogOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{translate(locale, 'appProvider.welcomeTitle')}</DialogTitle>
            <DialogDescription>{translate(locale, 'appProvider.welcomeDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="refx-user-name">{translate(locale, 'appProvider.yourName')}</Label>
            <Input
              id="refx-user-name"
              value={draftUserName}
              onChange={(event) => setDraftUserName(event.target.value)}
              placeholder={translate(locale, 'appProvider.namePlaceholder')}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleSaveUserName()
                }
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="refx-welcome-locale">{translate(locale, 'settings.language')}</Label>
            <Select value={locale} onValueChange={(value) => handleWelcomeLocaleChange(value as AppLocale)}>
              <SelectTrigger id="refx-welcome-locale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APP_LOCALES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {translate(option, `localeNames.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="refx-skip-name-prompt"
              checked={dontAskNameAgain}
              onCheckedChange={(checked) => setDontAskNameAgain(Boolean(checked))}
            />
            <Label htmlFor="refx-skip-name-prompt">{translate(locale, 'appProvider.dontAskAgain')}</Label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => void handleSkipNamePrompt()}
              disabled={!dontAskNameAgain}
            >
              {translate(locale, 'appProvider.continueWithoutName')}
            </Button>
            <Button onClick={() => void handleSaveUserName()} disabled={!draftUserName.trim()}>
              {translate(locale, 'appProvider.continue')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LocaleProvider>
  )
}
