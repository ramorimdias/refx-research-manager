'use client'

import { DragEvent, ReactNode, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { FileUp, Lock, WifiOff } from 'lucide-react'
import { AppSidebar } from './app-sidebar'
import { TopBar } from './top-bar'
import { CommandBar } from './command-bar'
import { DETACHED_READER_QUERY_VALUE } from '@/lib/services/reader-window-service'
import { getCurrentWindow, isTauri } from '@/lib/tauri/client'
import { useRuntimeState } from '@/lib/stores/runtime-store'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/localization'
import { getRemoteVaultDisplayMessage } from '@/lib/remote-vault-copy'

interface AppShellProps {
  children: ReactNode
}

const PENDING_IMPORT_STORAGE_KEY = 'refx.pending-import-paths'

export function AppShell({ children }: AppShellProps) {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { isDesktopApp, remoteVaultStatus } = useRuntimeState()
  const showRemoteReadOnlyBanner = Boolean(
    remoteVaultStatus?.enabled && (
      remoteVaultStatus.mode === 'remoteOfflineCache'
      || (remoteVaultStatus.mode === 'remoteReader' && remoteVaultStatus.activeLease)
    ),
  )
  const isDetachedReaderWindow =
    pathname === '/reader/view' && searchParams.get('detached') === DETACHED_READER_QUERY_VALUE
  const [isDragActive, setIsDragActive] = useState(false)
  const dragDepthRef = useRef(0)

  const queueDroppedPaths = (paths: string[]) => {
    if (typeof window === 'undefined' || paths.length === 0) return
    window.sessionStorage.setItem(PENDING_IMPORT_STORAGE_KEY, JSON.stringify(paths))
    window.dispatchEvent(new CustomEvent('refx-import-drop-queued'))
    router.push('/libraries')
  }

  const getDroppedPaths = (event: DragEvent<HTMLDivElement>) => {
    const fileList = Array.from(event.dataTransfer.files ?? [])
    return fileList
      .map((file) => (file as File & { path?: string }).path)
      .filter((value): value is string => Boolean(value && value.toLowerCase().endsWith('.pdf')))
  }

  useEffect(() => {
    if (!isTauri()) return

    let disposed = false
    let unlisten: (() => void) | undefined

    void getCurrentWindow()
      .onDragDropEvent((event) => {
        if (disposed) return

        if (event.payload.type === 'enter' || event.payload.type === 'over') {
          setIsDragActive(true)
          return
        }

        if (event.payload.type === 'leave') {
          setIsDragActive(false)
          return
        }

        if (event.payload.type === 'drop') {
          setIsDragActive(false)
          const droppedPaths = event.payload.paths.filter((value) => value.toLowerCase().endsWith('.pdf'))
          if (droppedPaths.length > 0) {
            queueDroppedPaths(droppedPaths)
          }
        }
      })
      .then((dispose) => {
        if (disposed) {
          dispose()
          return
        }
        unlisten = dispose
      })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [router])

  if (isDetachedReaderWindow) {
    return (
      <div className="h-screen w-full overflow-hidden bg-background">
        {children}
      </div>
    )
  }

  return (
    <div
      className="flex h-screen w-full overflow-hidden bg-background"
      onDragEnter={(event) => {
        if (isTauri()) return
        event.preventDefault()
        if (!isDesktopApp) return
        dragDepthRef.current += 1
        setIsDragActive(true)
      }}
      onDragOver={(event) => {
        if (isTauri()) return
        event.preventDefault()
        if (!isDesktopApp) return
        event.dataTransfer.dropEffect = 'copy'
        setIsDragActive(true)
      }}
      onDragLeave={(event) => {
        if (isTauri()) return
        event.preventDefault()
        if (!isDesktopApp) return
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
        if (dragDepthRef.current === 0 || event.currentTarget === event.target) {
          setIsDragActive(false)
        }
      }}
      onDrop={(event) => {
        if (isTauri()) return
        event.preventDefault()
        dragDepthRef.current = 0
        setIsDragActive(false)
        const droppedPaths = getDroppedPaths(event)
        if (droppedPaths.length > 0) {
          queueDroppedPaths(droppedPaths)
        }
      }}
    >
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        {showRemoteReadOnlyBanner ? (
          <div className="flex items-center gap-2 border-b border-amber-200/80 bg-amber-50 px-4 py-2 text-sm text-amber-950">
            {remoteVaultStatus?.mode === 'remoteOfflineCache' ? (
              <WifiOff className="h-4 w-4 shrink-0" />
            ) : (
              <Lock className="h-4 w-4 shrink-0" />
            )}
            <span>{getRemoteVaultDisplayMessage(t, remoteVaultStatus)}</span>
          </div>
        ) : null}
        <main className="min-w-0 flex-1 overflow-auto bg-background">
          {children}
        </main>
      </div>
      {isDragActive ? (
        <div className="pointer-events-none fixed inset-0 z-[1200] flex items-center justify-center bg-[rgba(24,28,32,0.14)] backdrop-blur-[2px]">
          <div className={cn(
            'rounded-[28px] border border-primary/20 bg-card/96 px-10 py-9 text-center shadow-[0_20px_60px_rgba(15,23,42,0.16)]',
          )}>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FileUp className="h-7 w-7" />
            </div>
            <p className="text-base font-semibold">{t('shell.dropTitle')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('shell.dropDescription')}</p>
          </div>
        </div>
      ) : null}
      <CommandBar />
    </div>
  )
}
