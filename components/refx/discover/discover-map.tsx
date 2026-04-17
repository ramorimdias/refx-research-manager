'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FileCheck, Star } from 'lucide-react'
import { computeHoverFocus } from '@/lib/services/map-hover-focus-service'
import { useDiscoverActions } from '@/lib/stores/discover-store'
import type { DiscoverMode, DiscoverWork } from '@/lib/types'
import { cn } from '@/lib/utils'

const DEFAULT_CANVAS_WIDTH = 640
const DEFAULT_CANVAS_HEIGHT = 620
const BUBBLE_RADIUS = 28
const NODE_SIZE = BUBBLE_RADIUS * 2
const CANVAS_SAFE_MARGIN = 24
const ZONE_GAP = 56
const GRID_X_GAP = 116
const GRID_Y_GAP = 122
const MIN_GRID_Y_GAP = 78
const HOVER_RELEASE_DELAY_MS = 120

type PositionedWork = {
  work: DiscoverWork
  x: number
  y: number
  isSource?: boolean
  linkedCount?: number
  relationMode?: DiscoverMode | 'starred'
}

type Zone = {
  left: number
  top: number
  width: number
  height: number
}

function packItemsInZone(items: DiscoverWork[], zone: Zone): PositionedWork[] {
  if (items.length === 0) return []

  const availableCols = Math.max(1, Math.floor(Math.max(zone.width - NODE_SIZE, 0) / GRID_X_GAP) + 1)
  const columns = Math.min(items.length, availableCols)
  const rows = Math.max(1, Math.ceil(items.length / columns))
  const horizontalSpan = columns > 1 ? Math.min(zone.width - NODE_SIZE, (columns - 1) * GRID_X_GAP) : 0
  const adaptiveYGap = rows > 1
    ? Math.max(MIN_GRID_Y_GAP, Math.min(GRID_Y_GAP, (zone.height - NODE_SIZE) / (rows - 1)))
    : GRID_Y_GAP
  const verticalSpan = rows > 1 ? Math.min(zone.height - NODE_SIZE, (rows - 1) * adaptiveYGap) : 0
  const startX = zone.left + Math.max(0, (zone.width - NODE_SIZE - horizontalSpan) / 2)
  const startY = zone.top + Math.max(0, (zone.height - NODE_SIZE - verticalSpan) / 2)

  return items.map((work, index) => {
    const rowIndex = index % rows
    const columnIndex = Math.floor(index / rows)

    return {
      work,
      x: startX + columnIndex * GRID_X_GAP,
      y: startY + rowIndex * adaptiveYGap,
    }
  })
}

function packStarredItems(items: DiscoverWork[], canvasWidth: number, canvasHeight: number): PositionedWork[] {
  if (items.length === 0) return []

  const usableWidth = Math.max(canvasWidth - CANVAS_SAFE_MARGIN * 2, NODE_SIZE)
  const usableHeight = Math.max(canvasHeight - CANVAS_SAFE_MARGIN * 2, NODE_SIZE)
  const columns = Math.max(1, Math.floor((usableWidth + 44) / GRID_X_GAP))
  const rows = Math.max(1, Math.ceil(items.length / columns))
  const horizontalStep = columns > 1
    ? Math.max(NODE_SIZE + 18, Math.min(GRID_X_GAP, (usableWidth - NODE_SIZE) / (columns - 1)))
    : 0
  const verticalStep = rows > 1
    ? Math.max(NODE_SIZE + 12, Math.min(96, (usableHeight - NODE_SIZE) / (rows - 1)))
    : 0

  return items.map((work, index) => {
    const row = index % rows
    const column = Math.floor(index / rows)
    const x = CANVAS_SAFE_MARGIN + column * horizontalStep
    const y = CANVAS_SAFE_MARGIN + row * verticalStep

    return { work, x, y }
  })
}

function radialPosition(index: number, total: number, canvasWidth: number, canvasHeight: number) {
  if (total === 0) {
    return { x: (canvasWidth - NODE_SIZE) / 2, y: (canvasHeight - NODE_SIZE) / 2 }
  }

  const angle = (Math.PI * 2 * index) / total
  const radius = Math.max(140, 100 + total * 8)

  return {
    x: (canvasWidth - NODE_SIZE) / 2 + Math.cos(angle) * radius,
    y: (canvasHeight - NODE_SIZE) / 2 + Math.sin(angle) * radius,
  }
}

function trimLineToBubbleEdge(sourceCenter: { x: number; y: number }, targetCenter: { x: number; y: number }) {
  const dx = targetCenter.x - sourceCenter.x
  const dy = targetCenter.y - sourceCenter.y
  const distance = Math.hypot(dx, dy) || 1
  const ux = dx / distance
  const uy = dy / distance

  return {
    sourceX: sourceCenter.x + ux * BUBBLE_RADIUS,
    sourceY: sourceCenter.y + uy * BUBBLE_RADIUS,
    targetX: targetCenter.x - ux * BUBBLE_RADIUS,
    targetY: targetCenter.y - uy * BUBBLE_RADIUS,
  }
}

function dedupeDiscoverItems(items: DiscoverWork[], sourceWorkId: string) {
  const seen = new Set<string>([sourceWorkId])
  const unique: DiscoverWork[] = []

  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    unique.push(item)
  }

  return unique
}

function DiscoverBubble({
  work,
  x,
  y,
  isSource,
  linkedCount,
  relationMode,
  isSelected,
  isHovered,
  isDimmed,
  hoverActive,
  labelSide,
  onClick,
  onHover,
}: PositionedWork & {
  isSelected: boolean
  isHovered: boolean
  isDimmed: boolean
  hoverActive: boolean
  labelSide?: 'below' | 'below-left' | 'below-right' | 'left' | 'right'
  onClick: () => void
  onHover: (hovered: boolean) => void
}) {
  const showExpandedLabel = isHovered
  const showLabel = !hoverActive || isHovered || isSelected || isSource
  const baseLabel = `${work.firstAuthorLabel}${work.year ? `, ${work.year}` : ''}`
  const showLibraryIcon = !isSource && work.inLibrary
  const showFavoriteIcon = !isSource && work.isStarred

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className="absolute bg-transparent text-left"
      style={{ left: x, top: y, width: NODE_SIZE, height: NODE_SIZE }}
    >
      <div
        className={cn(
          'flex h-[56px] w-[56px] items-center justify-center rounded-full border border-slate-700 bg-background shadow-sm transition-all duration-500 ease-out',
          isSource && 'border-amber-400 shadow-[0_0_0_10px_rgba(251,191,36,0.16)]',
          isSelected && !isSource && 'border-transparent shadow-[0_0_0_10px_rgba(251,191,36,0.16)]',
          isSelected && !isSource && relationMode === 'references' && 'bg-[radial-gradient(circle_at_center,rgba(191,219,254,0.92)_0%,rgba(219,234,254,0.82)_45%,rgba(255,255,255,0.98)_100%)]',
          isSelected && !isSource && relationMode === 'citations' && 'bg-[radial-gradient(circle_at_center,rgba(254,202,202,0.92)_0%,rgba(254,226,226,0.82)_45%,rgba(255,255,255,0.98)_100%)]',
          isSelected && !isSource && relationMode !== 'references' && relationMode !== 'citations' && 'bg-[radial-gradient(circle_at_center,rgba(253,230,138,0.9)_0%,rgba(254,243,199,0.82)_45%,rgba(255,255,255,0.98)_100%)]',
          !isSource && relationMode === 'references' && 'shadow-[inset_0_0_0_2px_rgba(59,130,246,0.55),inset_0_0_18px_rgba(59,130,246,0.22)]',
          !isSource && relationMode === 'citations' && 'shadow-[inset_0_0_0_2px_rgba(239,68,68,0.55),inset_0_0_18px_rgba(239,68,68,0.22)]',
          work.inLibrary && 'ring-2 ring-emerald-300/70',
          isHovered && 'scale-[1.06]',
          isDimmed && 'opacity-20',
        )}
      >
        {isSource && relationMode !== 'starred' ? (
          <span className="text-base font-semibold text-slate-700">{linkedCount ?? 0}</span>
        ) : showLibraryIcon || showFavoriteIcon ? (
          <div className="flex items-center justify-center">
            {showLibraryIcon ? (
              <FileCheck
                className="h-[17px] w-[17px] text-emerald-600"
                strokeWidth={2.2}
                style={{
                  filter: 'drop-shadow(0 0 0.8px rgba(255,255,255,1)) drop-shadow(0 0 2px rgba(255,255,255,0.95))',
                }}
              />
            ) : null}
            {showFavoriteIcon ? (
              <Star
                className={cn('h-[15px] w-[15px] fill-amber-400 text-white', showLibraryIcon && '-ml-1.5')}
                strokeWidth={2.1}
                style={{
                  filter: 'drop-shadow(0 0 0.8px rgba(255,255,255,1)) drop-shadow(0 0 2px rgba(255,255,255,0.95))',
                }}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      {showLabel ? (
        <div
          className={cn(
            'pointer-events-none absolute text-xs transition-all duration-500 ease-out',
            labelSide === 'right' && 'left-full top-1/2 ml-3 w-[240px] -translate-y-1/2 text-left',
            labelSide === 'left' && 'right-full top-1/2 mr-3 w-[240px] -translate-y-1/2 text-right',
            labelSide === 'below-left' && 'left-0 top-full mt-2 w-[220px] text-left',
            labelSide === 'below-right' && 'right-0 top-full mt-2 w-[220px] text-right',
            (!labelSide || labelSide === 'below') && 'left-1/2 top-full mt-2 w-[220px] -translate-x-1/2 text-center',
            isDimmed && 'opacity-20',
          )}
        >
          <div
            className="font-medium text-foreground"
            style={{
              WebkitTextStroke: '3px rgba(255,255,255,0.98)',
              paintOrder: 'stroke fill',
              textShadow: '0 1px 6px rgba(255,255,255,0.95), 0 0 10px rgba(255,255,255,0.9)',
            }}
          >
            {baseLabel}
          </div>
          {showExpandedLabel ? (
            <div
              className="mx-auto mt-1 max-w-[220px] text-[11px] leading-4 text-muted-foreground"
              style={{
                WebkitTextStroke: '2px rgba(255,255,255,0.96)',
                paintOrder: 'stroke fill',
                textShadow: '0 1px 6px rgba(255,255,255,0.92), 0 0 10px rgba(255,255,255,0.88)',
              }}
            >
              {work.title}
            </div>
          ) : null}
        </div>
      ) : null}
    </button>
  )
}

export function DiscoverMap({
  sourceWork,
  items,
  selectedWorkId,
  hoveredWorkId,
  mode,
  starredLinks = [],
}: {
  sourceWork: DiscoverWork
  items: DiscoverWork[]
  selectedWorkId: string | null
  hoveredWorkId: string | null
  mode?: DiscoverMode | 'starred'
  starredLinks?: Array<{ sourceId: string; targetId: string }>
}) {
  const { setSelectedWork, setHoveredWork } = useDiscoverActions()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const hoverReleaseTimeoutRef = useRef<number | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: DEFAULT_CANVAS_WIDTH, height: DEFAULT_CANVAS_HEIGHT })

  useEffect(() => {
    const element = containerRef.current
    if (!element || typeof ResizeObserver === 'undefined') return

    const updateSize = () => {
      const nextWidth = Math.max(Math.floor(element.clientWidth), 320)
      const nextHeight = Math.max(Math.floor(element.clientHeight), DEFAULT_CANVAS_HEIGHT)
      setCanvasSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight },
      )
    }

    updateSize()
    const observer = new ResizeObserver(() => updateSize())
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    return () => {
      if (hoverReleaseTimeoutRef.current != null) {
        window.clearTimeout(hoverReleaseTimeoutRef.current)
      }
    }
  }, [])

  const positioned = useMemo<PositionedWork[]>(() => {
    const canvasWidth = canvasSize.width
    const canvasHeight = canvasSize.height
    const uniqueItems = dedupeDiscoverItems(items, mode === 'starred' ? '__starred__' : sourceWork.id)
    const sortedItems = uniqueItems.sort((left, right) => {
      const leftYear = left.year ?? Number.MAX_SAFE_INTEGER
      const rightYear = right.year ?? Number.MAX_SAFE_INTEGER
      if (leftYear !== rightYear) return leftYear - rightYear
      return left.title.localeCompare(right.title)
    })

    if (mode === 'starred') {
      return packStarredItems(sortedItems, canvasWidth, canvasHeight).map((item) => ({
        ...item,
        relationMode: mode,
        isSource: false,
      }))
    }

    const sourceLeftX = CANVAS_SAFE_MARGIN
    const sourceRightX = canvasWidth - CANVAS_SAFE_MARGIN - NODE_SIZE
    const sourceTopY = CANVAS_SAFE_MARGIN

    const source: PositionedWork = {
      work: sourceWork,
      x: mode === 'references' ? sourceRightX : mode === 'citations' ? sourceLeftX : (canvasWidth - NODE_SIZE) / 2,
      y: sourceTopY,
      isSource: true,
      linkedCount: items.length,
      relationMode: mode,
    }

    const related = mode === 'references'
      ? packItemsInZone(sortedItems, {
        left: CANVAS_SAFE_MARGIN,
        top: CANVAS_SAFE_MARGIN + NODE_SIZE + 12,
        width: Math.max(0, sourceRightX - ZONE_GAP - CANVAS_SAFE_MARGIN),
        height: Math.max(0, canvasHeight - (CANVAS_SAFE_MARGIN + NODE_SIZE + 12) - CANVAS_SAFE_MARGIN),
      })
      : mode === 'citations'
        ? packItemsInZone(sortedItems, {
          left: sourceLeftX + NODE_SIZE + ZONE_GAP,
          top: CANVAS_SAFE_MARGIN + NODE_SIZE + 12,
          width: Math.max(0, canvasWidth - (sourceLeftX + NODE_SIZE + ZONE_GAP) - CANVAS_SAFE_MARGIN),
          height: Math.max(0, canvasHeight - (CANVAS_SAFE_MARGIN + NODE_SIZE + 12) - CANVAS_SAFE_MARGIN),
        })
        : sortedItems.map((work, index) => {
          const position = radialPosition(index, sortedItems.length, canvasWidth, canvasHeight)
          return { work, x: position.x, y: position.y, relationMode: mode, isSource: false }
        })

    return [source, ...related.map((item) => ({ ...item, relationMode: mode, isSource: item.isSource ?? false }))]
  }, [canvasSize.height, canvasSize.width, items, mode, sourceWork])

  const edges = useMemo(() => {
    const nodeById = new Map(positioned.map((node) => [node.work.id, node]))

    if (mode === 'starred') {
      return starredLinks
        .map((link) => {
          const sourceNode = nodeById.get(link.sourceId)
          const targetNode = nodeById.get(link.targetId)
          if (!sourceNode || !targetNode || sourceNode.work.id === targetNode.work.id) return null

          const sourceCenter = { x: sourceNode.x + BUBBLE_RADIUS, y: sourceNode.y + BUBBLE_RADIUS }
          const targetCenter = { x: targetNode.x + BUBBLE_RADIUS, y: targetNode.y + BUBBLE_RADIUS }
          const line = trimLineToBubbleEdge(sourceCenter, targetCenter)

          return {
            id: `${sourceNode.work.id}:${targetNode.work.id}`,
            source: sourceNode.work.id,
            target: targetNode.work.id,
            ...line,
          }
        })
        .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge))
    }

    const source = positioned[0]
    const related = positioned.slice(1)

    return related.map((item) => {
      const sourceNode = mode === 'citations' ? item : source
      const targetNode = mode === 'citations' ? source : item
      const sourceCenter = { x: sourceNode.x + BUBBLE_RADIUS, y: sourceNode.y + BUBBLE_RADIUS }
      const targetCenter = { x: targetNode.x + BUBBLE_RADIUS, y: targetNode.y + BUBBLE_RADIUS }
      const line = trimLineToBubbleEdge(sourceCenter, targetCenter)

      return {
        id: `${source.work.id}:${item.work.id}`,
        source: sourceNode.work.id,
        target: targetNode.work.id,
        ...line,
      }
    })
  }, [mode, positioned, starredLinks])

  const hoverFocus = useMemo(
    () => computeHoverFocus(
      hoveredWorkId,
      positioned.map((node) => ({ id: node.work.id })),
      edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
    ),
    [edges, hoveredWorkId, positioned],
  )
  const hoverActive = Boolean(hoveredWorkId)

  const handleBubbleHover = (workId: string, hovered: boolean) => {
    if (hoverReleaseTimeoutRef.current != null) {
      window.clearTimeout(hoverReleaseTimeoutRef.current)
      hoverReleaseTimeoutRef.current = null
    }

    if (hovered) {
      setHoveredWork(workId)
      return
    }

    hoverReleaseTimeoutRef.current = window.setTimeout(() => {
      setHoveredWork(null)
      hoverReleaseTimeoutRef.current = null
    }, HOVER_RELEASE_DELAY_MS)
  }

  return (
    <div ref={containerRef} className="relative h-full min-h-[620px] overflow-hidden rounded-[28px] border bg-card/95">
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <marker id="discover-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#e2e8f0" />
          </marker>
        </defs>
        {edges.map((edge) => (
          <line
            key={edge.id}
            x1={edge.sourceX}
            y1={edge.sourceY}
            x2={edge.targetX}
            y2={edge.targetY}
            stroke="currentColor"
            strokeWidth="1.8"
            markerEnd="url(#discover-arrow)"
            className={cn(
              'text-slate-200 transition-opacity duration-500 ease-out',
              hoverActive && hoverFocus.dimmedEdgeIds.has(edge.id) ? 'opacity-0' : hoverFocus.dimmedEdgeIds.has(edge.id) ? 'opacity-20' : 'opacity-90',
            )}
          />
        ))}
      </svg>

      {positioned.map((node) => (
        <DiscoverBubble
          key={node.work.id}
          {...node}
          isSelected={selectedWorkId === node.work.id}
          isHovered={hoveredWorkId === node.work.id}
          isDimmed={hoverFocus.dimmedNodeIds.has(node.work.id)}
          hoverActive={hoverActive}
          labelSide={(() => {
            if (node.isSource) {
              return mode === 'citations'
                ? 'right'
                : mode === 'references'
                  ? 'left'
                  : 'below'
            }

            if (node.x <= CANVAS_SAFE_MARGIN + 18) return 'below-left'
            if (node.x >= canvasSize.width - CANVAS_SAFE_MARGIN - NODE_SIZE - 18) return 'below-right'
            return 'below'
          })()}
          onClick={() => setSelectedWork(node.work.id)}
          onHover={(hovered) => handleBubbleHover(node.work.id, hovered)}
        />
      ))}
    </div>
  )
}
