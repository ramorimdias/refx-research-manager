'use client'

import { useState } from 'react'
import {
  Settings,
  Bell,
  Lock,
  Database,
  Palette,
  FileText,
  ShieldAlert,
  Download,
  RotateCcw,
  Save,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function SettingsPage() {
  const [isDirty, setIsDirty] = useState(false)
  const [theme, setTheme] = useState('light')
  const [fontSize, setFontSize] = useState('16')
  const [autoOcr, setAutoOcr] = useState(true)
  const [autoMetadata, setAutoMetadata] = useState(true)
  const [researchNotifications, setResearchNotifications] = useState(false)

  const handleSave = () => {
    setIsDirty(false)
    // Handle save logic here
  }

  const handleChange = () => {
    setIsDirty(true)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Settings className="h-6 w-6" />
              Settings
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Manage your Refx preferences</p>
          </div>
          {isDirty && (
            <Button onClick={handleSave}>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation */}
        <div className="w-56 shrink-0 border-r border-border overflow-auto hidden md:block">
          <nav className="p-4 space-y-1">
            {[
              { id: 'general', label: 'General', icon: Settings },
              { id: 'display', label: 'Display & Theme', icon: Palette },
              { id: 'notifications', label: 'Notifications', icon: Bell },
              { id: 'privacy', label: 'Privacy & Security', icon: Lock },
              { id: 'data', label: 'Data Management', icon: Database },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm hover:bg-muted transition-colors"
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-2xl mx-auto p-6 space-y-6">
            {/* General Settings */}
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold mb-4">General</h2>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Researcher Profile</CardTitle>
                  <CardDescription>Optional local profile used for citation defaults</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-sm">First Name</Label>
                      <Input placeholder="John" className="mt-1.5" />
                    </div>
                    <div>
                      <Label className="text-sm">Last Name</Label>
                      <Input placeholder="Doe" className="mt-1.5" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm">Preferred Citation Name</Label>
                    <Input placeholder="Doe, Jane" className="mt-1.5" />
                  </div>
                  <div>
                    <Label className="text-sm">Institution/Affiliation</Label>
                    <Input placeholder="University or Research Institute" className="mt-1.5" />
                  </div>
                </CardContent>
              </Card>

              {/* Display Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Display & Appearance</CardTitle>
                  <CardDescription>Customize how Refx looks and feels</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm">Theme</Label>
                    <Select value={theme} onValueChange={(v) => { setTheme(v); handleChange(); }}>
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
                    <Select value={fontSize} onValueChange={(v) => { setFontSize(v); handleChange(); }}>
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
            </div>

            <Separator />

            {/* Processing Settings */}
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold mb-4">Document Processing</h2>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Automatic Processing</CardTitle>
                  <CardDescription>Enable automatic document processing features</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Optical Character Recognition</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Automatically OCR scanned documents
                      </p>
                    </div>
                    <Checkbox
                      checked={autoOcr}
                      onCheckedChange={(checked) => {
                        setAutoOcr(!!checked)
                        handleChange()
                      }}
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Metadata Extraction</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Automatically extract titles, authors, and publication info
                      </p>
                    </div>
                    <Checkbox
                      checked={autoMetadata}
                      onCheckedChange={(checked) => {
                        setAutoMetadata(!!checked)
                        handleChange()
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Separator />

            {/* Notification Settings */}
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold mb-4">Notifications</h2>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Notification Preferences</CardTitle>
                  <CardDescription>Choose how you want to be notified</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Desktop Notifications</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Show local reminders and background task updates
                      </p>
                    </div>
                    <Checkbox
                      checked={researchNotifications}
                      onCheckedChange={(checked) => {
                        setResearchNotifications(!!checked)
                        handleChange()
                      }}
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Reading Nudges</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Prompt you about unread items in your local queue
                      </p>
                    </div>
                    <Checkbox
                      checked={researchNotifications}
                      onCheckedChange={(checked) => {
                        setResearchNotifications(!!checked)
                        handleChange()
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Separator />

            {/* Data Management */}
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold mb-4">Data Management</h2>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Backup & Restore</CardTitle>
                  <CardDescription>Export and restore your library data</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button variant="outline" className="w-full">
                      <Download className="mr-2 h-4 w-4" />
                      Export Library
                    </Button>
                    <Button variant="outline" className="w-full">
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Import Library
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Storage Usage</CardTitle>
                  <CardDescription>View your storage consumption</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">PDF Documents</span>
                      <span className="text-sm text-muted-foreground">2.4 GB / 10 GB</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full w-1/4 bg-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Separator />

            {/* Privacy & Security */}
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold mb-4">Privacy & Security</h2>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Offline Mode</CardTitle>
                  <CardDescription>No account login is required for this desktop-only build</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                      <div>
                        <p className="text-sm font-medium">Local Workspace</p>
                        <p className="text-xs text-muted-foreground mt-1">All data is stored on this device only</p>
                      </div>
                      <Badge variant="default">Offline</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-red-200 bg-red-50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-red-900">
                    <ShieldAlert className="h-4 w-4" />
                    Danger Zone
                  </CardTitle>
                  <CardDescription className="text-red-800">
                    Irreversible and destructive actions
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="destructive" className="w-full">
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Clear All Local Data
                  </Button>
                  <p className="text-xs text-red-700">
                    This will permanently delete all local documents and cache. This action cannot be undone.
                  </p>
                </CardContent>
              </Card>
            </div>

            <Separator />

            {/* About */}
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold mb-4">About</h2>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Version & Support</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Refx Version</span>
                    <Badge variant="secondary">v1.0.0</Badge>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Need help? Check out our documentation or contact support.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button variant="outline" size="sm">
                        Documentation
                      </Button>
                      <Button variant="outline" size="sm">
                        Contact Support
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
