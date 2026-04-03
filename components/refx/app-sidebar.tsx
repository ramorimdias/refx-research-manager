'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRouter } from 'next/navigation'
import {
  Home,
  Search,
  Library,
  BookOpen,
  Brackets,
  StickyNote,
  Waypoints,
  CloudDownload,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/lib/stores/ui-store'
import { useLibraryStore } from '@/lib/stores/library-store'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useT } from '@/lib/localization'

const mainNavItems = [
  { href: '/', labelKey: 'nav.home', icon: Home },
  { href: '/search', labelKey: 'nav.search', icon: Search },
  { href: '/libraries', labelKey: 'nav.libraries', icon: Library },
  { href: '/reader', labelKey: 'nav.reader', icon: BookOpen },
  { href: '/references', labelKey: 'nav.references', icon: Brackets },
  { href: '/notes', labelKey: 'nav.notes', icon: StickyNote },
  { href: '/maps', labelKey: 'nav.maps', icon: Waypoints },
  { href: '/metadata', labelKey: 'nav.metadata', icon: CloudDownload },
  { href: '/reports', labelKey: 'nav.reports', icon: BarChart3 },
]

function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true" className={className} fill="none">
      <defs>
        <linearGradient id="sidebar-brand-gradient" x1="112" y1="160" x2="400" y2="416" gradientUnits="userSpaceOnUse">
          <stop stopColor="#28D1B5" />
          <stop offset="1" stopColor="#35D7B0" />
        </linearGradient>
      </defs>
      <text
        x="256"
        y="160"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="Segoe UI, Arial, sans-serif"
        fontSize="128"
        fontWeight="700"
      >
        Refx
      </text>
      <g stroke="url(#sidebar-brand-gradient)" strokeWidth="14" strokeLinecap="round">
        <line x1="256" y1="314" x2="145" y2="211" />
        <line x1="256" y1="314" x2="367" y2="211" />
        <line x1="256" y1="314" x2="145" y2="417" />
        <line x1="256" y1="314" x2="367" y2="417" />
      </g>
      <g fill="url(#sidebar-brand-gradient)">
        <circle cx="145" cy="211" r="35" />
        <circle cx="367" cy="211" r="35" />
        <circle cx="145" cy="417" r="35" />
        <circle cx="367" cy="417" r="35" />
        <circle cx="256" cy="314" r="21" />
      </g>
    </svg>
  )
}

export function AppSidebar() {
  const t = useT()
  const pathname = usePathname()
  const router = useRouter()
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const activeLibraryId = useLibraryStore((state) => state.activeLibraryId)
  const setActiveLibrary = useLibraryStore((state) => state.setActiveLibrary)
  const libraries = useLibraryStore((state) => state.libraries)

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'flex h-full flex-col border-r border-sidebar-border/80 bg-sidebar/96 backdrop-blur transition-all duration-200',
          sidebarCollapsed ? 'w-[72px]' : 'w-[15rem]'
        )}
      >
        <div className="flex h-16 items-center border-b border-sidebar-border/80 px-3">
          <Link
            href="/"
            className="flex w-full items-center gap-3 overflow-hidden"
          >
            <BrandMark className="h-8 w-8 shrink-0 text-neutral-950 dark:text-neutral-50" />
            <div
              className={cn(
                'min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-200',
                sidebarCollapsed ? 'max-w-0 -translate-x-1 opacity-0' : 'max-w-[10rem] translate-x-0 opacity-100',
              )}
            >
              <span className="block text-base font-semibold tracking-tight text-neutral-950 dark:text-neutral-50">Refx</span>
              <p className="truncate text-[11px] text-sidebar-foreground/55">{t('nav.researchWorkspace')}</p>
            </div>
          </Link>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            <div className="mb-2">
              {sidebarCollapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-full rounded-xl text-sidebar-foreground/55 hover:bg-sidebar-accent/65 hover:text-sidebar-foreground"
                  onClick={toggleSidebar}
                >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{t('nav.expandSidebar')}</TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-full rounded-xl text-sidebar-foreground/62 hover:bg-sidebar-accent/65 hover:text-sidebar-foreground"
                  onClick={toggleSidebar}
                  aria-label={t('nav.collapseSidebar')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
            </div>
            <nav className="space-y-1.5">
              {mainNavItems.map((item) => {
                const isActive = pathname === item.href || 
                  (item.href !== '/' && pathname.startsWith(item.href))
                
                const navLink = (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]'
                        : 'text-sidebar-foreground/62 hover:bg-sidebar-accent/65 hover:text-sidebar-foreground'
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span
                      className={cn(
                        'min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-200',
                        sidebarCollapsed ? 'max-w-0 -translate-x-1 opacity-0' : 'max-w-[10.25rem] translate-x-0 opacity-100',
                      )}
                    >
                      {t(item.labelKey)}
                    </span>
                  </Link>
                )

                if (sidebarCollapsed) {
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>{navLink}</TooltipTrigger>
                      <TooltipContent side="right" className="font-medium">
                        {t(item.labelKey)}
                      </TooltipContent>
                    </Tooltip>
                  )
                }

                return navLink
              })}
            </nav>

            {!sidebarCollapsed && (
              <>
                <Separator className="my-4" />
                <Collapsible defaultOpen>
                  <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold tracking-[0.12em] text-sidebar-foreground/45 hover:text-sidebar-foreground/65">
                    <span>{t('nav.libraryGroup')}</span>
                    <ChevronDown className="h-3 w-3" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-1.5">
                    {libraries.map((library) => (
                      <button
                        key={library.id}
                        onClick={() => {
                          setActiveLibrary(library.id)
                          router.push('/libraries')
                        }}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                          activeLibraryId === library.id
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                            : 'text-sidebar-foreground/62 hover:bg-sidebar-accent/65 hover:text-sidebar-foreground'
                        )}
                      >
                        <div
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: library.color }}
                        />
                        <span className="min-w-0 flex-1 truncate">{library.name}</span>
                        <span className="ml-auto text-xs text-sidebar-foreground/40">
                          {library.documentCount}
                        </span>
                      </button>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}
          </div>
        </ScrollArea>
      </aside>
    </TooltipProvider>
  )
}
