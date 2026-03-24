'use client'

import { Search, Bell, Upload, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/lib/store'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Kbd } from '@/components/ui/kbd'

export function TopBar() {
  const { toggleCommandPalette, importDocuments, isDesktopApp } = useAppStore()
  const { setTheme, theme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleImport = async () => {
    if (!isDesktopApp || isImporting) return
    setIsImporting(true)
    try {
      await importDocuments()
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4">
      {/* Search trigger */}
      <button
        onClick={toggleCommandPalette}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-input bg-secondary/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search documents, commands...</span>
        <Kbd>
          <span className="text-xs">⌘</span>K
        </Kbd>
      </button>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={handleImport}
          disabled={!isDesktopApp || isImporting}
        >
          <Upload className="h-4 w-4" />
          <span className="hidden sm:inline">{isImporting ? 'Importing...' : 'Import'}</span>
        </Button>

        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          <Badge className="absolute -right-1 -top-1 h-4 w-4 p-0 text-[10px]" variant="destructive">
            3
          </Badge>
        </Button>

        {mounted && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  JD
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">Dr. Jane Doe</p>
                <p className="text-xs text-muted-foreground">jane.doe@university.edu</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Subscription</DropdownMenuItem>
            <DropdownMenuItem>Team</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
