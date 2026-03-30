'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Database, Download, HardDrive, Loader2, Palette, RefreshCw, RotateCcw, Settings, ShieldAlert, Sparkles, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { open, save } from '@/lib/tauri/client'
import {
  DEFAULT_APP_SETTINGS,
  getBaseThemeMode,
  getThemeAccentVariant,
  loadAppSettings,
  saveAppSettings,
  type StoredAppSettings,
} from '@/lib/app-settings'
import * as repo from '@/lib/repositories/local-db'
import { useAppStore } from '@/lib/store'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { AppUpdateDialog } from '@/components/refx/app-update-dialog'
import { checkForAppUpdate, downloadAndInstallAppUpdate, type AppUpdateSummary } from '@/lib/services/app-update-service'
import { APP_LOCALES, useLocale, useT } from '@/lib/localization'
import { APP_VERSION } from '@/lib/app-version'

type SettingsSection = 'general' | 'display' | 'processing' | 'data' | 'about'

export default function SettingsPage() {
  const t = useT()
  const { locale } = useLocale()
  const router = useRouter()
  const { setTheme } = useTheme()
  const { clearLocalData, refreshData, scanDocumentsOcr, documents, isDesktopApp } = useAppStore()
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')
  const [isClearing, setIsClearing] = useState(false)
  const [isScanningOcr, setIsScanningOcr] = useState(false)
  const [isCreatingBackup, setIsCreatingBackup] = useState(false)
  const [isRestoringBackup, setIsRestoringBackup] = useState(false)
  const [backups, setBackups] = useState<repo.DbBackupFileMetadata[]>([])
  const [backupStatus, setBackupStatus] = useState<string | null>(null)
  const [settings, setSettings] = useState<StoredAppSettings>(DEFAULT_APP_SETTINGS)
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false)
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<string | null>(null)
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdateSummary | null>(null)
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false)
  const [isRecheckingDoiReferences, setIsRecheckingDoiReferences] = useState(false)
  const [doiReferenceStatus, setDoiReferenceStatus] = useState<string | null>(null)
  const [restoreTargetPath, setRestoreTargetPath] = useState<string | null>(null)
  const [isRestoreWarningOpen, setIsRestoreWarningOpen] = useState(false)
  const hasLoadedSettingsRef = useRef(false)
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const loaded = await loadAppSettings(isDesktopApp)
      if (!cancelled) {
        setSettings(loaded)
        hasLoadedSettingsRef.current = true
        setIsSettingsLoaded(true)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [isDesktopApp])

  const sections: Array<{ id: SettingsSection; label: string; icon: typeof Settings }> = [
    { id: 'general', label: t('settings.general'), icon: Settings },
    { id: 'display', label: t('settings.display'), icon: Palette },
    { id: 'processing', label: t('settings.processing'), icon: Sparkles },
    { id: 'data', label: t('settings.data'), icon: Database },
    { id: 'about', label: t('settings.about'), icon: HardDrive },
  ]

  const activeMeta = useMemo(
    () => sections.find((section) => section.id === activeSection) ?? sections[0],
    [activeSection, sections],
  )

  const updateSettings = <K extends keyof StoredAppSettings>(key: K, value: StoredAppSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  useEffect(() => {
    if (!hasLoadedSettingsRef.current) return

    const applyAndSave = async () => {
      await saveAppSettings(isDesktopApp, settings)
      const accentVariant = getThemeAccentVariant(settings.theme)
      setTheme(getBaseThemeMode(settings.theme))
      if (typeof document !== 'undefined') {
        if (accentVariant) {
          document.documentElement.dataset.refxAccent = accentVariant
        } else {
          delete document.documentElement.dataset.refxAccent
        }
        document.documentElement.style.fontSize = `${settings.fontSize}px`
      }
    }

    void applyAndSave()
  }, [isDesktopApp, setTheme, settings])

  const loadBackups = async () => {
    if (!isDesktopApp) {
      setBackups([])
      return
    }
    const nextBackups = await repo.listBackups()
    setBackups(nextBackups.filter((backup) => backup.automatic))
  }

  useEffect(() => {
    if (!isDesktopApp) return
    void loadBackups()
  }, [isDesktopApp])

  const applySettingsImmediately = () => {
    const accentVariant = getThemeAccentVariant(settings.theme)
    setTheme(getBaseThemeMode(settings.theme))
    if (typeof document !== 'undefined') {
      if (accentVariant) {
        document.documentElement.dataset.refxAccent = accentVariant
      } else {
        delete document.documentElement.dataset.refxAccent
      }
      document.documentElement.style.fontSize = `${settings.fontSize}px`
    }
  }

  useEffect(() => {
    if (!isSettingsLoaded) return
    applySettingsImmediately()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSettingsLoaded, settings.theme, settings.fontSize])

  const handleClearLocalData = async () => {
    const confirmed = window.confirm('Clear all local documents, notes, and imported files? This cannot be undone.')
    if (!confirmed) return

    setIsClearing(true)
    try {
      await clearLocalData()
      router.push('/libraries')
    } finally {
      setIsClearing(false)
    }
  }

  const handleScanAllOcr = async () => {
    setIsScanningOcr(true)
    try {
      await scanDocumentsOcr()
    } finally {
      setIsScanningOcr(false)
    }
  }

  const handleRecheckDoiReferences = async () => {
    if (!isDesktopApp) return

    setIsRecheckingDoiReferences(true)
    setDoiReferenceStatus(null)
    try {
      const references = await repo.recheckDocumentDoiReferences()
      const matchedCount = references.filter((reference) => reference.matchedDocumentId).length
      setDoiReferenceStatus(
        references.length > 0
          ? `Rechecked ${references.length} DOI reference${references.length === 1 ? '' : 's'}. ${matchedCount} matched a document.`
          : 'No stored DOI references to recheck yet.',
      )
    } catch (error) {
      setDoiReferenceStatus(error instanceof Error ? error.message : 'Could not recheck DOI references.')
    } finally {
      setIsRecheckingDoiReferences(false)
    }
  }

  const handleCreateBackup = async (scope: repo.DbBackupScope) => {
    if (!isDesktopApp) return
    const backupPath = await save({
      defaultPath: `refx-${scope}-${new Date().toISOString().slice(0, 10)}.refxbackup.json`,
      filters: [{ name: 'REFX Backup', extensions: ['json'] }],
    })
    if (!backupPath) return
    setIsCreatingBackup(true)
    setBackupStatus(null)
    try {
      const backup = await repo.createBackup(scope, false, backupPath)
      setBackupStatus(`Saved ${backup.fileName}`)
    } finally {
      setIsCreatingBackup(false)
    }
  }

  const handleOpenRestoreWarning = (path: string) => {
    setRestoreTargetPath(path)
    setIsRestoreWarningOpen(true)
  }

  const handleRestoreBackup = async () => {
    if (!isDesktopApp) return
    if (!restoreTargetPath) return
    setIsRestoringBackup(true)
    setBackupStatus(null)
    try {
      const result = await repo.restoreBackup(restoreTargetPath)
      const restoredSettings = await loadAppSettings(isDesktopApp)
      setSettings(restoredSettings)
      await refreshData()
      setBackupStatus(`Backup restored. Safety backup created: ${result.safetyBackup.fileName}`)
      await loadBackups()
      setIsRestoreWarningOpen(false)
      setRestoreTargetPath(null)
    } finally {
      setIsRestoringBackup(false)
    }
  }

  const handleRestoreFromFile = async () => {
    if (!isDesktopApp) return
    const selected = await open({
      multiple: false,
      filters: [{ name: 'REFX Backup', extensions: ['json'] }],
    })
    if (!selected || Array.isArray(selected)) return
    handleOpenRestoreWarning(selected)
  }

  const handleDeleteBackup = async (path: string) => {
    if (!isDesktopApp) return
    const confirmed = window.confirm('Delete this backup file?')
    if (!confirmed) return
    await repo.deleteBackup(path)
    await loadBackups()
  }

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdates(true)
    setUpdateStatus(null)
    try {
      const result = await checkForAppUpdate()
      if (!result.supported) {
        setAvailableUpdate(null)
        setUpdateStatus(result.reason)
        return
      }

      if (!result.update) {
        setAvailableUpdate(null)
        setUpdateStatus(t('settings.latestVersion'))
        return
      }

      setAvailableUpdate(result.update)
      setUpdateStatus(t('settings.updateAvailable', { version: result.update.version }))
      setIsUpdateDialogOpen(true)
    } catch (error) {
      setUpdateStatus(error instanceof Error ? error.message : t('settings.unableToCheckForUpdates'))
    } finally {
      setIsCheckingUpdates(false)
    }
  }

  const handleInstallUpdate = async () => {
    setIsInstallingUpdate(true)
    setUpdateStatus(t('settings.preparingUpdate'))
    try {
      await downloadAndInstallAppUpdate((message) => {
        setUpdateStatus(message)
      })
    } catch (error) {
      setUpdateStatus(error instanceof Error ? error.message : t('settings.updateInstallFailed'))
      setIsInstallingUpdate(false)
    }
  }

  if (!isSettingsLoaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t('appProvider.loadingWorkspace')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="border-b border-border/80 bg-background/92 px-6 py-5 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Settings className="h-6 w-6" />
              {t('settings.title')}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('settings.subtitle')}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden w-56 shrink-0 overflow-auto border-r border-border/80 bg-muted/20 md:block">
          <nav className="space-y-1 p-4">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={cn(
                  'flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                  activeSection === id ? 'bg-background font-medium text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.06)]' : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
                )}
                onClick={() => setActiveSection(id)}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{activeMeta.label}</h2>
              <p className="text-sm text-muted-foreground">{t('settings.adjustLocalBehavior')}</p>
            </div>

            {activeSection === 'general' && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t('settings.profileTitle')}</CardTitle>
                    <CardDescription>{t('settings.profileDescription')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">{t('settings.yourName')}</Label>
                      <Input
                        value={settings.userName}
                        onChange={(event) => updateSettings('userName', event.target.value)}
                        className="mt-2"
                        placeholder={t('settings.yourNamePlaceholder')}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('settings.yourNameHelp')}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">{t('settings.language')}</Label>
                      <Select value={settings.locale} onValueChange={(value) => updateSettings('locale', value as StoredAppSettings['locale'])}>
                        <SelectTrigger className="mt-1.5 max-w-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {APP_LOCALES.map((locale) => (
                            <SelectItem key={locale} value={locale}>
                              {t(`localeNames.${locale}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Workspace Mode</CardTitle>
                    <CardDescription>Everything stays local in this build.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                      <div>
                        <p className="text-sm font-medium">Local Workspace</p>
                        <p className="mt-1 text-xs text-muted-foreground">All content stays on this device.</p>
                      </div>
                      <Badge>Offline</Badge>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {activeSection === 'display' && (
              <Card>
                <CardHeader>
                    <CardTitle className="text-base">{t('settings.appearanceTitle')}</CardTitle>
                    <CardDescription>{t('settings.appearanceDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm">{t('settings.theme')}</Label>
                    <Select value={settings.theme} onValueChange={(value) => updateSettings('theme', value as StoredAppSettings['theme'])}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system">System</SelectItem>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="light-brown">Light Brown</SelectItem>
                        <SelectItem value="light-red">Light Red</SelectItem>
                        <SelectItem value="light-green">Light Green</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="dark-brown">Dark Brown</SelectItem>
                        <SelectItem value="dark-red">Dark Red</SelectItem>
                        <SelectItem value="dark-green">Dark Green</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm">{t('settings.fontSize')}</Label>
                    <Select value={settings.fontSize} onValueChange={(value) => updateSettings('fontSize', value as StoredAppSettings['fontSize'])}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="14">Small (14px)</SelectItem>
                        <SelectItem value="16">Medium (16px)</SelectItem>
                        <SelectItem value="18">Large (18px)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeSection === 'processing' && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Automatic Processing</CardTitle>
                    <CardDescription>Processing defaults.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">Auto OCR</Label>
                        <p className="mt-1 text-xs text-muted-foreground">Run OCR after import.</p>
                      </div>
                      <Checkbox checked={settings.autoOcr} onCheckedChange={(checked) => updateSettings('autoOcr', !!checked)} />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">Auto Metadata Extraction</Label>
                        <p className="mt-1 text-xs text-muted-foreground">Extract title, authors, year, and DOI during import.</p>
                      </div>
                      <Checkbox
                        checked={settings.autoMetadata}
                        onCheckedChange={(checked) => updateSettings('autoMetadata', !!checked)}
                      />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">Auto Online Metadata Enrichment</Label>
                        <p className="mt-1 text-xs text-muted-foreground">Use Crossref first and Semantic Scholar second when metadata is incomplete.</p>
                      </div>
                      <Checkbox
                        checked={settings.autoOnlineMetadataEnrichment}
                        onCheckedChange={(checked) => updateSettings('autoOnlineMetadataEnrichment', !!checked)}
                      />
                    </div>

                    <Separator />

                    <div>
                      <Label className="text-sm font-medium">Advanced Semantic Classification</Label>
                        <p className="mt-1 text-xs text-muted-foreground">Optional topic classification after tag suggestion.</p>
                      <Select
                        value={settings.advancedClassificationMode}
                        onValueChange={(value) => updateSettings('advancedClassificationMode', value as StoredAppSettings['advancedClassificationMode'])}
                      >
                        <SelectTrigger className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="off">Disabled</SelectItem>
                          <SelectItem value="local_heuristic">Local Heuristic</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Metadata API Configuration</CardTitle>
                  <CardDescription>Provider configuration is stored locally on this device.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium">Crossref Contact Email</Label>
                      <p className="mt-1 text-xs text-muted-foreground">Optional contact hint for Crossref requests.</p>
                      <Input
                        type="email"
                        value={settings.crossrefContactEmail}
                        onChange={(event) => updateSettings('crossrefContactEmail', event.target.value)}
                        className="mt-2"
                        placeholder="name@example.com"
                      />
                    </div>

                    <div>
                      <Label className="text-sm font-medium">Semantic Scholar API Key</Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Leave blank to use the bundled default key. Add your own if you want a less busy quota for this device.
                      </p>
                      <Input
                        type="password"
                        value={settings.semanticScholarApiKey}
                        onChange={(event) => updateSettings('semanticScholarApiKey', event.target.value)}
                        className="mt-2"
                        placeholder="Leave blank to use the bundled default key"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">OCR Scan</CardTitle>
                  <CardDescription>Scan stored documents and persist OCR/search state.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">{documents.length} documents available.</p>
                    <Button variant="outline" onClick={() => void handleScanAllOcr()} disabled={isScanningOcr || documents.length === 0}>
                      {isScanningOcr ? 'Scanning...' : 'Scan All OCR'}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">DOI Links</CardTitle>
                    <CardDescription>Recheck stored DOI references against all documents after new imports.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button variant="outline" onClick={() => void handleRecheckDoiReferences()} disabled={isRecheckingDoiReferences}>
                      {isRecheckingDoiReferences ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      {isRecheckingDoiReferences ? 'Rechecking...' : 'Recheck DOI Links'}
                    </Button>
                    {doiReferenceStatus ? (
                      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                        {doiReferenceStatus}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </>
            )}

            {activeSection === 'data' && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t('settings.appUpdates')}</CardTitle>
                    <CardDescription>{t('settings.appUpdatesDescription')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">{t('settings.checkAutomatically')}</Label>
                        <p className="mt-1 text-xs text-muted-foreground">{t('settings.checkAutomaticallyHelp')}</p>
                      </div>
                      <Checkbox
                        checked={settings.autoCheckForUpdates}
                        onCheckedChange={(checked) => updateSettings('autoCheckForUpdates', !!checked)}
                      />
                    </div>

                    <Separator />

                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" onClick={() => void handleCheckForUpdates()} disabled={isCheckingUpdates}>
                        {isCheckingUpdates ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        {isCheckingUpdates ? t('settings.checking') : t('settings.checkForUpdates')}
                      </Button>
                      <Button onClick={() => void handleInstallUpdate()} disabled={isInstallingUpdate || !availableUpdate}>
                        {isInstallingUpdate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        {isInstallingUpdate ? t('updateDialog.installing') : t('settings.downloadInstall')}
                      </Button>
                    </div>

                    {updateStatus ? (
                      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                        {updateStatus}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Local Data</CardTitle>
                  <CardDescription>Reset local content while keeping app preferences.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                      This removes documents, notes, comments, tags, and imported files, then recreates one empty library.
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Backups</CardTitle>
                    <CardDescription>Single-file local backups for documents, notes, maps, and settings.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium">Automatic Backups</Label>
                          <p className="mt-1 text-xs text-muted-foreground">App-managed backups created on startup when due.</p>
                        </div>
                        <Checkbox
                          checked={settings.autoBackupEnabled}
                          onCheckedChange={(checked) => updateSettings('autoBackupEnabled', !!checked)}
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        <div>
                          <Label className="text-sm">Backup Scope</Label>
                          <Select
                            value={settings.autoBackupScope}
                            onValueChange={(value) => updateSettings('autoBackupScope', value as StoredAppSettings['autoBackupScope'])}
                          >
                            <SelectTrigger className="mt-1.5">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="full">Everything</SelectItem>
                              <SelectItem value="documents">Documents Only</SelectItem>
                              <SelectItem value="settings">Settings Only</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="text-sm">Frequency in days</Label>
                          <Input
                            className="mt-1.5"
                            type="number"
                            min={1}
                            step={1}
                            value={settings.autoBackupIntervalDays}
                            onChange={(event) =>
                              updateSettings(
                                'autoBackupIntervalDays',
                                String(Math.max(1, Number.parseInt(event.target.value || '1', 10) || 1)),
                              )
                            }
                          />
                        </div>

                        <div>
                          <Label className="text-sm">Keep backups</Label>
                          <Input
                            className="mt-1.5"
                            type="number"
                            min={1}
                            max={10}
                            step={1}
                            value={settings.autoBackupKeepCount}
                            onChange={(event) =>
                              updateSettings(
                                'autoBackupKeepCount',
                                String(
                                  Math.min(10, Math.max(1, Number.parseInt(event.target.value || '1', 10) || 1)),
                                ),
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Manual Backup Export</Label>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => void handleCreateBackup('full')} disabled={isCreatingBackup}>
                          <Download className="mr-2 h-4 w-4" />
                          Everything
                        </Button>
                        <Button variant="outline" onClick={() => void handleCreateBackup('documents')} disabled={isCreatingBackup}>
                          <Download className="mr-2 h-4 w-4" />
                          Documents
                        </Button>
                        <Button variant="outline" onClick={() => void handleCreateBackup('settings')} disabled={isCreatingBackup}>
                          <Download className="mr-2 h-4 w-4" />
                          Settings
                        </Button>
                        <Button variant="outline" onClick={() => void handleRestoreFromFile()} disabled={isRestoringBackup}>
                          <Upload className="mr-2 h-4 w-4" />
                          Restore File
                        </Button>
                      </div>
                      {backupStatus ? <p className="text-xs text-muted-foreground">{backupStatus}</p> : null}
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Automatic Backups</Label>
                        <Button variant="ghost" size="sm" onClick={() => void loadBackups()}>
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Refresh
                        </Button>
                      </div>

                      {backups.length === 0 ? (
                        <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                          No automatic backups yet.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {backups.map((backup) => (
                            <div key={backup.path} className="rounded-xl border border-border/80 bg-background/70 p-3">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{backup.fileName}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {backup.scope} • {backup.documentCount} docs • {backup.noteCount} notes • {backup.relationCount} links
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">{new Date(backup.createdAt).toLocaleString()}</p>
                                </div>
                                <div className="flex gap-2">
                                  <Button variant="outline" size="sm" onClick={() => handleOpenRestoreWarning(backup.path)} disabled={isRestoringBackup}>
                                    Restore
                                  </Button>
                                  <Button variant="ghost" size="icon-sm" onClick={() => void handleDeleteBackup(backup.path)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-red-200/70 bg-red-50/80">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base text-red-900">
                      <ShieldAlert className="h-4 w-4" />
                      Danger Zone
                    </CardTitle>
                    <CardDescription className="text-red-800">This action is irreversible.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button variant="destructive" className="w-full" onClick={() => void handleClearLocalData()} disabled={isClearing}>
                      {isClearing ? 'Clearing...' : 'Clear Local Data'}
                    </Button>
                  </CardContent>
                </Card>
              </>
            )}

            {activeSection === 'about' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Application</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Mode</span>
                    <Badge variant="secondary">{isDesktopApp ? 'Desktop' : 'Preview'}</Badge>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Version</span>
                    <Badge variant="secondary">v{APP_VERSION}</Badge>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
      <AppUpdateDialog
        open={isUpdateDialogOpen}
        onOpenChange={setIsUpdateDialogOpen}
        update={availableUpdate}
        isInstalling={isInstallingUpdate}
        installStatus={updateStatus}
        onInstall={() => void handleInstallUpdate()}
        locale={locale}
      />
      <AlertDialog
        open={isRestoreWarningOpen}
        onOpenChange={(open) => {
          if (!isRestoringBackup) {
            setIsRestoreWarningOpen(open)
            if (!open) {
              setRestoreTargetPath(null)
            }
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore backup and replace current local data?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                This is destructive. REFX will wipe the current local data inside the selected restore scope before applying the backup.
              </span>
              <span className="block">
                To protect you, REFX will create a full safety backup first. If the restore fails or the result is not what you expected, you can restore from that safety backup.
              </span>
              <span className="block font-medium text-foreground">
                Continue only if you want to replace your current local state with the selected backup.
              </span>
              {restoreTargetPath ? (
                <span className="block rounded-md border border-border/80 bg-muted/40 px-3 py-2 text-xs text-foreground/80">
                  Source: {restoreTargetPath}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoringBackup}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRestoreBackup()} disabled={isRestoringBackup}>
              {isRestoringBackup ? 'Restoring...' : 'Create safety backup and restore'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
