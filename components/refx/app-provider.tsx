'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useAppStore } from '@/lib/store'
import { Loader2 } from 'lucide-react'
import { getBaseThemeMode, getThemeAccentVariant, loadAppSettings, saveAppSettings, type StoredAppSettings } from '@/lib/app-settings'
import * as repo from '@/lib/repositories/local-db'
import { useTheme } from 'next-themes'
import { AppUpdateDialog } from '@/components/refx/app-update-dialog'
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
import {
  checkForAppUpdate,
  dismissPendingAppUpdate,
  downloadAndInstallAppUpdate,
  type AppUpdateSummary,
} from '@/lib/services/app-update-service'

interface AppProviderProps {
  children: React.ReactNode
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
  const initialize = useAppStore((state) => state.initialize)
  const initialized = useAppStore((state) => state.initialized)
  const isDesktopApp = useAppStore((state) => state.isDesktopApp)
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)
  const setSidebarCollapsed = useAppStore((state) => state.setSidebarCollapsed)
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
      setDraftUserName(settings.userName)
      setDontAskNameAgain(settings.skipNamePrompt)
      setIsNameDialogOpen(!settings.userName.trim() && !settings.skipNamePrompt)
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

  if (isLoading || !initialized || !isUiPrefsReady || !isSettingsReady) {
    const locale = appSettings?.locale ?? 'en'
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/icon.svg"
              alt="Refx"
              width={40}
              height={40}
              className="h-10 w-10 rounded-xl"
            />
            <span className="text-2xl font-semibold">Refx</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{translate(locale, 'appProvider.loadingWorkspace')}</span>
          </div>
        </div>
      </div>
    )
  }

  const locale = appSettings?.locale ?? 'en'
  return (
    <LocaleProvider initialLocale={locale}>
      {!isNameDialogOpen ? children : null}
      <AppUpdateDialog
        open={isUpdateDialogOpen}
        onOpenChange={handleUpdateDialogOpenChange}
        update={availableUpdate}
        isInstalling={isInstallingUpdate}
        installStatus={updateInstallStatus}
        onInstall={() => void handleInstallUpdate()}
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
