'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { Loader2 } from 'lucide-react'

interface AppProviderProps {
  children: React.ReactNode
}

export function AppProvider({ children }: AppProviderProps) {
  const [isLoading, setIsLoading] = useState(true)
  const initialize = useAppStore((state) => state.initialize)
  const initialized = useAppStore((state) => state.initialized)
  const isDesktopApp = useAppStore((state) => state.isDesktopApp)

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

  if (isLoading || !initialized) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">
              R
            </div>
            <span className="text-2xl font-semibold">Refx</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading your research library...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {isDesktopApp && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
            Desktop Mode
          </div>
        </div>
      )}
      {children}
    </>
  )
}
