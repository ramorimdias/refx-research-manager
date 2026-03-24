'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Database, HardDrive, Palette, Save, Settings, ShieldAlert, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DEFAULT_APP_SETTINGS, loadAppSettings, saveAppSettings, type StoredAppSettings } from '@/lib/app-settings'
import { useAppStore } from '@/lib/store'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

type SettingsSection = 'general' | 'display' | 'processing' | 'data' | 'about'

const sections: Array<{ id: SettingsSection; label: string; icon: typeof Settings }> = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'display', label: 'Display', icon: Palette },
  { id: 'processing', label: 'Processing', icon: Sparkles },
  { id: 'data', label: 'Data', icon: Database },
  { id: 'about', label: 'About', icon: HardDrive },
]

export default function SettingsPage() {
  const router = useRouter()
  const { setTheme } = useTheme()
  const { clearLocalData, scanDocumentsOcr, documents, isDesktopApp } = useAppStore()
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')
  const [isDirty, setIsDirty] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [isScanningOcr, setIsScanningOcr] = useState(false)
  const [settings, setSettings] = useState<StoredAppSettings>(DEFAULT_APP_SETTINGS)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const loaded = await loadAppSettings(isDesktopApp)
      if (!cancelled) {
        setSettings(loaded)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [isDesktopApp])

  const activeMeta = useMemo(
    () => sections.find((section) => section.id === activeSection) ?? sections[0],
    [activeSection],
  )

  const updateSettings = <K extends keyof StoredAppSettings>(key: K, value: StoredAppSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
    setIsDirty(true)
  }

  const handleSave = async () => {
    await saveAppSettings(isDesktopApp, settings)
    setTheme(settings.theme)
    if (typeof document !== 'undefined') {
      document.documentElement.style.fontSize = `${settings.fontSize}px`
    }
    setIsDirty(false)
  }

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

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <Settings className="h-6 w-6" />
              Settings
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Desktop-only preferences for your local workspace</p>
          </div>
          {isDirty && (
            <Button onClick={() => void handleSave()}>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden w-56 shrink-0 overflow-auto border-r border-border md:block">
          <nav className="space-y-1 p-4">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  activeSection === id ? 'bg-muted font-medium text-foreground' : 'hover:bg-muted/70 text-muted-foreground',
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
              <h2 className="text-lg font-semibold">{activeMeta.label}</h2>
              <p className="text-sm text-muted-foreground">Update the local behavior for this installation.</p>
            </div>

            {activeSection === 'general' && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Workspace Mode</CardTitle>
                    <CardDescription>Authentication, sync accounts, and notifications are disabled in this build.</CardDescription>
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
                  <CardTitle className="text-base">Appearance</CardTitle>
                  <CardDescription>Adjust how the app looks on this device.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm">Theme</Label>
                    <Select value={settings.theme} onValueChange={(value) => updateSettings('theme', value as StoredAppSettings['theme'])}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm">Base Font Size</Label>
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
                    <CardDescription>Local document processing preferences.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">Auto OCR</Label>
                        <p className="mt-1 text-xs text-muted-foreground">Automatically scan imported PDFs for searchable local text.</p>
                      </div>
                      <Checkbox checked={settings.autoOcr} onCheckedChange={(checked) => updateSettings('autoOcr', !!checked)} />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">Auto Metadata Extraction</Label>
                        <p className="mt-1 text-xs text-muted-foreground">Attempt to extract title, authors, year, and DOI during import.</p>
                      </div>
                      <Checkbox
                        checked={settings.autoMetadata}
                        onCheckedChange={(checked) => updateSettings('autoMetadata', !!checked)}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">OCR Scan</CardTitle>
                    <CardDescription>Scan all locally stored documents and persist their OCR/search state.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">{documents.length} documents available for OCR scanning.</p>
                    <Button variant="outline" onClick={() => void handleScanAllOcr()} disabled={isScanningOcr || documents.length === 0}>
                      {isScanningOcr ? 'Scanning OCR...' : 'Scan OCR In All Documents'}
                    </Button>
                  </CardContent>
                </Card>
              </>
            )}

            {activeSection === 'data' && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Local Data</CardTitle>
                    <CardDescription>Reset all user content while keeping your app preferences.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                      Clear Local Data removes documents, notes, annotations, tags, and imported files, then recreates one empty default library.
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-red-200 bg-red-50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base text-red-900">
                      <ShieldAlert className="h-4 w-4" />
                      Danger Zone
                    </CardTitle>
                    <CardDescription className="text-red-800">This action is irreversible.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button variant="destructive" className="w-full" onClick={() => void handleClearLocalData()} disabled={isClearing}>
                      {isClearing ? 'Clearing Local Data...' : 'Clear All Local Data'}
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
                    <Badge variant="secondary">v1.0.0</Badge>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
