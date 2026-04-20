'use client'

import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '@/lib/stores/ui-store'
import { useRuntimeActions, useRuntimeState } from '@/lib/stores/runtime-store'
import {
  DEFAULT_APP_SETTINGS,
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
import { forceSafeDesktopFallback } from '@/lib/store'
import {
  checkForAppUpdate,
  dismissPendingAppUpdate,
  downloadAndInstallAppUpdate,
  type AppUpdateSummary,
} from '@/lib/services/app-update-service'
import { getCurrentWindow, isTauri, WebviewWindow } from '@/lib/tauri/client'
import { getRemoteVaultStatusSnapshot, getRemoteVaultSyncPhaseSnapshot } from '@/lib/remote-storage-state'

interface AppProviderProps {
  children: React.ReactNode
}

const DEBUG_LOADING_SPLASH_UNTIL_KEY = 'refx.debug.loading-splash-until'
const SETTINGS_LOAD_TIMEOUT_MS = 8000
const STARTUP_WATCHDOG_TIMEOUT_MS = 15000
const REMOTE_VAULT_IDLE_LEASE_RELEASE_MS = 15 * 60 * 1000

function isLikelyMacDesktop() {
  if (typeof window === 'undefined') return false
  const navigatorWithUAData = window.navigator as Navigator & {
    userAgentData?: { platform?: string }
  }
  const platform = navigatorWithUAData.userAgentData?.platform ?? window.navigator.platform ?? window.navigator.userAgent
  return /mac/i.test(platform)
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timeoutId)
        reject(error)
      },
    )
  })
}

function pushPrimitiveBootMessage(message: string) {
  if (typeof window === 'undefined') return
  const bootstrapWindow = window as Window & {
    __REFX_BOOTSTRAP__?: {
      push?: (message: string) => void
    }
  }
  bootstrapWindow.__REFX_BOOTSTRAP__?.push?.(message)
}

export function AppProvider({ children }: AppProviderProps) {
  const [isUiPrefsReady, setIsUiPrefsReady] = useState(false)
  const [isSettingsReady, setIsSettingsReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [appSettings, setAppSettings] = useState<StoredAppSettings | null>(null)
  const [isNameDialogOpen, setIsNameDialogOpen] = useState(false)
  const [draftUserName, setDraftUserName] = useState('')
  const [dontAskNameAgain, setDontAskNameAgain] = useState(false)
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdateSummary | null>(null)
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false)
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false)
  const [updateInstallStatus, setUpdateInstallStatus] = useState<string | null>(null)
  const [debugSplashUntil, setDebugSplashUntil] = useState<number | null>(null)
  const [startupStatusLine, setStartupStatusLine] = useState('Preparing startup')
  const [startupDiagnostics, setStartupDiagnostics] = useState<string[]>([])
  const hasRevealedDesktopWindow = useRef(false)
  const { initialize } = useRuntimeActions()
  const { initialized, isDesktopApp } = useRuntimeState()
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed)
  const setSidebarCollapsed = useUiStore((state) => state.setSidebarCollapsed)
  const { setTheme } = useTheme()
  const isMacTauri = isTauri() && isLikelyMacDesktop()

  const pushStartupDiagnostic = (message: string) => {
    setStartupDiagnostics((current) => [...current.slice(-5), message])
    pushPrimitiveBootMessage(message)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    const bootstrapWindow = window as Window & {
      __REFX_APP_PROVIDER_MOUNTED__?: boolean
    }

    bootstrapWindow.__REFX_APP_PROVIDER_MOUNTED__ = true
    window.dispatchEvent(new Event('refx:app-provider-mounted'))
    pushPrimitiveBootMessage('react app provider mounted')
  }, [])

  useEffect(() => {
    const init = async () => {
      setStartupStatusLine('Initializing runtime')
      pushStartupDiagnostic(`[runtime] initialize:start`)
      try {
        await initialize()
        setStartupStatusLine('Runtime initialized')
        pushStartupDiagnostic(`[runtime] initialize:done`)
      } catch (error) {
        console.error('Failed to initialize app:', error)
        setStartupStatusLine('Runtime fallback')
        pushStartupDiagnostic(`[runtime] initialize:error ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        setIsLoading(false)
      }
    }

    init()
  }, [initialize])

  useEffect(() => {
    if (!initialized) return

    const applySettings = async () => {
      let settings = DEFAULT_APP_SETTINGS
      setStartupStatusLine('Loading settings')
      pushStartupDiagnostic(`[settings] load:start desktop=${String(isDesktopApp)}`)

      try {
        settings = await withTimeout(loadAppSettings(isDesktopApp), SETTINGS_LOAD_TIMEOUT_MS, 'Loading app settings')
        pushStartupDiagnostic(`[settings] load:done locale=${settings.locale}`)
      } catch (error) {
        console.error('Failed to load app settings; using defaults.', error)
        pushStartupDiagnostic(`[settings] load:error ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        setAppSettings(settings)
        window.localStorage.setItem(SPLASH_LOCALE_STORAGE_KEY, settings.locale)
        setDraftUserName(settings.userName)
        setDontAskNameAgain(settings.skipNamePrompt)
        const shouldAskForName = !settings.userName.trim() && !settings.skipNamePrompt
        setIsNameDialogOpen(shouldAskForName)
        setTheme(getBaseThemeMode(settings.theme))
        const accentVariant = getThemeAccentVariant(settings.theme)
        if (accentVariant) {
          document.documentElement.dataset.refxAccent = accentVariant
        } else {
          delete document.documentElement.dataset.refxAccent
        }
        document.documentElement.style.fontSize = `${settings.fontSize}px`

        if (isDesktopApp && settings.autoBackupEnabled) {
          const intervalDays = Number(settings.autoBackupIntervalDays)
          const keepCount = Number(settings.autoBackupKeepCount)
          const backupTask = settings.remoteVaultEnabled
            ? repo.runScheduledRemoteVaultBackupIfDue(intervalDays, keepCount)
            : repo.runScheduledBackupIfDue(settings.autoBackupScope, intervalDays, keepCount)

          void backupTask.catch((error) => {
            console.error('Automatic backup failed:', error)
          })
        }

        setIsSettingsReady(true)
        setStartupStatusLine('Settings ready')
        pushStartupDiagnostic(`[settings] ready`)
      }
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
    setIsNameDialogOpen(false)
  }

  const handleSkipNamePrompt = async () => {
    if (!appSettings) return

    const nextSettings = { ...appSettings, userName: '', skipNamePrompt: true }
    setAppSettings(nextSettings)
    setDontAskNameAgain(true)
    await saveAppSettings(isDesktopApp, nextSettings)
    setIsNameDialogOpen(false)
  }

  const handleWelcomeLocaleChange = (nextLocale: AppLocale) => {
    setAppSettings((current) => (current ? { ...current, locale: nextLocale } : current))
  }

  useEffect(() => {
    if (!initialized || typeof window === 'undefined') return

    setStartupStatusLine('Loading UI preferences')
    pushStartupDiagnostic(`[ui] prefs:start`)
    const stored = window.localStorage.getItem('refx.ui.sidebar-collapsed')
    if (stored !== null) {
      setSidebarCollapsed(stored === 'true')
    }
    setIsUiPrefsReady(true)
    setStartupStatusLine('UI preferences ready')
    pushStartupDiagnostic(`[ui] prefs:done`)
  }, [initialized, setSidebarCollapsed])

  useEffect(() => {
    if (!initialized || !isUiPrefsReady || typeof window === 'undefined') return
    window.localStorage.setItem('refx.ui.sidebar-collapsed', String(sidebarCollapsed))
  }, [initialized, isUiPrefsReady, sidebarCollapsed])

  useEffect(() => {
    if (!initialized || !isDesktopApp || !isTauri() || typeof window === 'undefined') return

    let idleTimer: number | null = null
    let reacquiringLease = false

    const clearIdleTimer = () => {
      if (idleTimer !== null) {
        window.clearTimeout(idleTimer)
        idleTimer = null
      }
    }

    const releaseLeaseIfIdle = () => {
      const status = getRemoteVaultStatusSnapshot()
      if (!status.enabled || status.mode !== 'remoteWriter') return
      if (getRemoteVaultSyncPhaseSnapshot() !== 'idle') {
        scheduleIdleTimer()
        return
      }

      void repo.releaseRemoteVaultLease().catch((error) => {
        console.warn('Remote vault idle lease release failed:', error)
      })
    }

    const scheduleIdleTimer = () => {
      clearIdleTimer()
      idleTimer = window.setTimeout(releaseLeaseIfIdle, REMOTE_VAULT_IDLE_LEASE_RELEASE_MS)
    }

    const reacquireLeaseIfNeeded = () => {
      const status = getRemoteVaultStatusSnapshot()
      if (!status.enabled || status.mode !== 'remoteReader' || status.activeLease || reacquiringLease) return

      reacquiringLease = true
      void repo.getRemoteVaultStatus({ acquireLease: true })
        .catch((error) => {
          console.warn('Remote vault idle lease reacquire failed:', error)
        })
        .finally(() => {
          reacquiringLease = false
        })
    }

    const recordActivity = () => {
      scheduleIdleTimer()
      reacquireLeaseIfNeeded()
    }

    const activityEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'wheel']
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, { passive: true })
    })
    window.addEventListener('touchstart', recordActivity, { passive: true })
    scheduleIdleTimer()

    return () => {
      clearIdleTimer()
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity)
      })
      window.removeEventListener('touchstart', recordActivity)
    }
  }, [initialized, isDesktopApp])

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
    if (!isDesktopApp || !isTauri() || !shouldShowLoadingScreen) return

    const timeoutId = window.setTimeout(() => {
      console.error('Startup watchdog triggered; forcing safe desktop fallback.')
      setStartupStatusLine('Startup fallback')
      pushStartupDiagnostic(`[watchdog] fallback:start`)

      forceSafeDesktopFallback()
      setIsLoading(false)
      setIsUiPrefsReady(true)
      setIsSettingsReady(true)
      setIsNameDialogOpen(false)
      setAppSettings(DEFAULT_APP_SETTINGS)
      setDraftUserName(DEFAULT_APP_SETTINGS.userName)
      setDontAskNameAgain(DEFAULT_APP_SETTINGS.skipNamePrompt)
      window.localStorage.setItem(SPLASH_LOCALE_STORAGE_KEY, DEFAULT_APP_SETTINGS.locale)
      setTheme(getBaseThemeMode(DEFAULT_APP_SETTINGS.theme))
      delete document.documentElement.dataset.refxAccent
      document.documentElement.style.fontSize = `${DEFAULT_APP_SETTINGS.fontSize}px`
      pushStartupDiagnostic(`[watchdog] fallback:done`)
    }, STARTUP_WATCHDOG_TIMEOUT_MS)

    return () => window.clearTimeout(timeoutId)
  }, [isDesktopApp, setTheme, shouldShowLoadingScreen])

  useEffect(() => {
    if (!isDesktopApp || !isTauri() || shouldShowLoadingScreen || hasRevealedDesktopWindow.current) return

    hasRevealedDesktopWindow.current = true
    setStartupStatusLine('Revealing main window')
    pushStartupDiagnostic(`[window] reveal:start`)

    void (async () => {
      try {
        const currentWindow = getCurrentWindow()
        await currentWindow.show()
        await currentWindow.setFocus().catch(() => undefined)

        const splashWindow = await WebviewWindow.getByLabel('splash')
        if (splashWindow) {
          await splashWindow.close().catch(() => undefined)
        }
        setStartupStatusLine('Startup complete')
        pushStartupDiagnostic(`[window] reveal:done`)
      } catch (error) {
        hasRevealedDesktopWindow.current = false
        console.warn('Failed to reveal main window after startup:', error)
        pushStartupDiagnostic(`[window] reveal:error ${error instanceof Error ? error.message : String(error)}`)
      }
    })()
  }, [isDesktopApp, shouldShowLoadingScreen])

  if (shouldShowLoadingScreen) {
    const locale = appSettings?.locale ?? 'en'
    return (
      <AppLoadingScreen
        compact
        locale={locale}
        statusLine={isMacTauri ? startupStatusLine : undefined}
        diagnostics={isMacTauri ? startupDiagnostics : undefined}
        className="min-h-screen bg-[radial-gradient(circle_at_top,#dbeafe_0%,#f8fafc_34%,#eef2ff_100%)] dark:bg-[radial-gradient(circle_at_top,#1d2841_0%,#0f172a_36%,#09090b_100%)]"
      />
    )
  }

  const locale = appSettings?.locale ?? 'en'
  return (
    <LocaleProvider initialLocale={locale}>
      <AppTourProvider
        enabled={!isNameDialogOpen}
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
