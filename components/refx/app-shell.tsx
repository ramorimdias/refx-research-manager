'use client'

import { ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { AppSidebar } from './app-sidebar'
import { TopBar } from './top-bar'
import { CommandBar } from './command-bar'
import { DETACHED_READER_QUERY_VALUE } from '@/lib/services/reader-window-service'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isDetachedReaderWindow =
    pathname === '/reader/view' && searchParams.get('detached') === DETACHED_READER_QUERY_VALUE

  if (isDetachedReaderWindow) {
    return (
      <div className="h-screen w-full overflow-hidden bg-background">
        {children}
      </div>
    )
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
      <CommandBar />
    </div>
  )
}
