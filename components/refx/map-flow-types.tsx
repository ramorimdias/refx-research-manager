'use client'

import Link from 'next/link'
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  getStraightPath,
  type EdgeProps,
  type NodeProps,
  useStore,
} from 'reactflow'
import { BookOpen, Plus, Star } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import * as repo from '@/lib/repositories/local-db'
import type { DocumentGraphNodeData } from '@/lib/services/document-relation-service'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/localization'

export type ConnectionDirection = 'outbound' | 'inbound'

type GraphNodeExtraState = {
  pendingConnectionDirection: ConnectionDirection | null
  onStartConnection: (documentId: string, direction: ConnectionDirection) => void
}

export type GraphNodeData = DocumentGraphNodeData & GraphNodeExtraState
export type ReferenceGraphNodeData = {
  workReference: repo.DbWorkReference
  label: string
  isSelected?: boolean
  isHovered?: boolean
  isDimmed?: boolean
}
export type AnyGraphNodeData = GraphNodeData | ReferenceGraphNodeData
const MAP_BUBBLE_RADIUS = 28

function trimLineToBubbleEdge(sourceCenter: { x: number; y: number }, targetCenter: { x: number; y: number }) {
  const dx = targetCenter.x - sourceCenter.x
  const dy = targetCenter.y - sourceCenter.y
  const distance = Math.hypot(dx, dy) || 1
  const ux = dx / distance
  const uy = dy / distance

  return {
    sourceX: sourceCenter.x + ux * MAP_BUBBLE_RADIUS,
    sourceY: sourceCenter.y + uy * MAP_BUBBLE_RADIUS,
    targetX: targetCenter.x - ux * MAP_BUBBLE_RADIUS,
    targetY: targetCenter.y - uy * MAP_BUBBLE_RADIUS,
  }
}

function RelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerStart,
  markerEnd,
  label,
  selected,
  data,
}: EdgeProps) {
  const trimmed = trimLineToBubbleEdge({ x: sourceX, y: sourceY }, { x: targetX, y: targetY })
  const [edgePath, labelX, labelY] = getStraightPath(trimmed)
  const edgeData = (data ?? {}) as {
    confidence?: number
    isHovered?: boolean
    isConnectedToSelectedDocument?: boolean
    connectionDirection?: 'incoming' | 'outgoing' | null
    relationStatus?: string
  }
  const connectedDirection = edgeData.connectionDirection
  const confidence = typeof edgeData.confidence === 'number'
    ? Math.round(edgeData.confidence * 100)
    : null

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerStart={markerStart} markerEnd={markerEnd} style={style} />
      {(label && selected) ? (
        <EdgeLabelRenderer>
          <div
            className={cn(
              'pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl border px-3 py-2 text-[11px] shadow-md',
              selected
                ? 'border-teal-200 bg-white text-slate-900'
                : connectedDirection === 'outgoing'
                  ? 'border-sky-200 bg-sky-50/95 text-sky-900'
                  : connectedDirection === 'incoming'
                    ? 'border-rose-200 bg-rose-50/95 text-rose-900'
                    : 'border-slate-200 bg-white/96 text-slate-700',
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            <p className="font-semibold">{String(label)}</p>
            {confidence !== null ? (
              <p className="mt-1 text-[10px] text-slate-500">
                Confidence {confidence}%{edgeData.relationStatus ? ` - ${edgeData.relationStatus.replace(/_/g, ' ')}` : ''}
              </p>
            ) : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}

function DocumentGraphNode({ data }: NodeProps<GraphNodeData>) {
  const t = useT()
  const zoom = useStore((state) => state.transform[2])
  const {
    document,
    connectionDirection,
    isHovered,
    isDimmed,
    isDropping,
    isSelected,
    onStartConnection,
    pendingConnectionDirection,
  } = data
  const authorText = document.authors.length > 0
    ? document.authors[0]
    : t('searchPage.unknownAuthor')
  const authorTokens = authorText.split(/\s+/).filter(Boolean)
  const authorLabel = authorTokens.length > 0 ? authorTokens[authorTokens.length - 1] : authorText
  const baseLabel = `${authorLabel}${document.year ? `, ${document.year}` : ''}`
  const canCreateInboundLinks = document.documentType !== 'my_work'
  const showExpandedLabel = Boolean(isHovered)
  const showStar = Boolean(document.favorite)
  const showMyWorkIcon = document.documentType === 'my_work'
  const bubbleBorder = isSelected
    ? 'border-amber-400'
    : connectionDirection === 'outgoing'
      ? 'border-sky-500'
      : connectionDirection === 'incoming'
        ? 'border-rose-500'
        : 'border-slate-700'
  const bubbleGlow = isSelected
    ? 'shadow-[0_0_0_10px_rgba(251,191,36,0.16)]'
    : connectionDirection === 'outgoing'
      ? 'shadow-[inset_0_0_0_2px_rgba(59,130,246,0.55),inset_0_0_18px_rgba(59,130,246,0.18)]'
      : connectionDirection === 'incoming'
        ? 'shadow-[inset_0_0_0_2px_rgba(244,63,94,0.55),inset_0_0_18px_rgba(244,63,94,0.18)]'
        : 'shadow-sm'

  return (
    <div
      data-document-node-id={document.id}
      className={cn(
        'relative z-10 h-full w-full overflow-visible transition-all',
        pendingConnectionDirection && 'ring-4 ring-teal-100',
        isHovered && !isSelected && 'scale-[1.03]',
        isDropping && 'animate-[refx-map-drop-bounce_720ms_cubic-bezier(0.22,0.8,0.22,1)]',
        isDimmed && 'opacity-20',
      )}
    >
      {isDropping ? (
        <style jsx>{`
          @keyframes refx-map-drop-bounce {
            0% { transform: translateY(-26px) scale(1.12); }
            34% { transform: translateY(0) scale(0.88); }
            62% { transform: translateY(-8px) scale(1.035); }
            82% { transform: translateY(0) scale(0.975); }
            100% { transform: translateY(0) scale(1); }
          }
        `}</style>
      ) : null}
      <div className="flex h-full w-full items-center justify-center">
        <div className={cn('flex h-[56px] w-[56px] items-center justify-center rounded-full border bg-background transition', bubbleBorder, bubbleGlow)}>
          {showMyWorkIcon || showStar ? (
            <div className="flex items-center justify-center">
              {showMyWorkIcon ? (
                <BookOpen className="h-7 w-7 text-amber-700" strokeWidth={2.1} />
              ) : null}
              {showStar ? (
                <Star
                  className={cn('h-3.5 w-3.5 fill-amber-400 text-amber-400', showMyWorkIcon && '-ml-1.5')}
                  strokeWidth={2.1}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div
        className={cn('pointer-events-none absolute top-0 w-[240px] text-center transition', isDimmed && 'opacity-20')}
        style={{
          left: 28,
          top: 68,
          transform: `translateX(-50%) scale(${1 / Math.max(zoom, 0.001)})`,
          transformOrigin: 'top center',
        }}
      >
        <div
          className="text-sm font-semibold text-foreground"
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
            className="mx-auto mt-1 max-w-[240px] text-xs leading-4 text-muted-foreground"
            style={{
              WebkitTextStroke: '2px rgba(255,255,255,0.96)',
              paintOrder: 'stroke fill',
              textShadow: '0 1px 6px rgba(255,255,255,0.92), 0 0 10px rgba(255,255,255,0.88)',
            }}
          >
            {document.title}
          </div>
        ) : null}
      </div>

      <Handle
        id="center-target"
        type="target"
        position={Position.Left}
        isConnectableStart={false}
        isConnectableEnd={false}
        className="!pointer-events-none !z-0 !h-1 !w-1 !border-0 !bg-transparent !opacity-0"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
      />
      <Handle
        id="drop-target"
        type="target"
        position={Position.Right}
        isConnectableStart={false}
        isConnectableEnd
        className="!absolute !z-0 !h-full !w-full !border-0 !bg-transparent !opacity-0"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
      />
      <Handle
        id="center-source"
        type="source"
        position={Position.Right}
        isConnectableStart={false}
        isConnectableEnd={false}
        className="!pointer-events-none !z-0 !h-1 !w-1 !border-0 !bg-transparent !opacity-0"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
      />

      {isSelected ? (
        <div
          className="group/link-actions absolute left-1/2 top-0 z-30"
          style={{
            transform: `translate(-50%, -36px) scale(${1 / Math.max(zoom, 0.001)})`,
            transformOrigin: 'top center',
          }}
        >
          <div className="relative flex flex-col items-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-400 bg-amber-300 text-black shadow-sm transition group-hover/link-actions:border-amber-500 group-hover/link-actions:bg-amber-400">
              <Plus className="h-4 w-4" />
            </div>
            <div
              className={cn(
                'absolute bottom-full mb-3 flex items-center gap-3 transition',
                'pointer-events-auto opacity-100',
              )}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onStartConnection(document.id, 'outbound')
                    }}
                    className={cn(
                      'min-w-[136px] whitespace-nowrap rounded-full border px-4 py-2 text-xs font-semibold shadow-sm transition',
                      pendingConnectionDirection === 'outbound'
                        ? 'border-sky-600 bg-sky-600 text-white'
                        : 'border-sky-500 bg-sky-500 text-white hover:border-sky-600 hover:bg-sky-600',
                    )}
                  >
                    {t('mapsPage.addReference')}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={8}>
                  {t('mapsPage.addReferenceHelp')}
                </TooltipContent>
              </Tooltip>
              {canCreateInboundLinks ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onStartConnection(document.id, 'inbound')
                      }}
                      className={cn(
                        'min-w-[136px] whitespace-nowrap rounded-full border px-4 py-2 text-xs font-semibold shadow-sm transition',
                        pendingConnectionDirection === 'inbound'
                          ? 'border-rose-600 bg-rose-600 text-white'
                          : 'border-rose-500 bg-rose-500 text-white hover:border-rose-600 hover:bg-rose-600',
                      )}
                    >
                      {t('mapsPage.addCitation')}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={8}>
                    {t('mapsPage.addCitationHelp')}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {pendingConnectionDirection ? (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-10 rounded-full border-2 border-dashed',
            pendingConnectionDirection === 'outbound'
              ? 'border-sky-500/90'
              : 'border-rose-500/90',
          )}
        />
      ) : null}
    </div>
  )
}

function ReferenceGraphNode({ data, selected }: NodeProps<ReferenceGraphNodeData>) {
  const zoom = useStore((state) => state.transform[2])
  const baseLabel = data.workReference.reference.title || data.label || 'Reference'
  return (
    <div
      className={cn(
        'relative flex h-full w-full items-center justify-center overflow-visible rounded-full border border-slate-700 bg-background shadow-sm transition-all',
        data.isDimmed && 'opacity-40',
        selected && 'border-amber-400 shadow-[0_0_0_10px_rgba(251,191,36,0.16)]',
        data.isHovered && !selected && 'scale-[1.03]',
      )}
    >
      <div
        className="pointer-events-none absolute top-0 w-[240px] text-center"
        style={{
          left: 28,
          top: 68,
          transform: `translateX(-50%) scale(${1 / Math.max(zoom, 0.001)})`,
          transformOrigin: 'top center',
        }}
      >
        <div
          className="text-sm font-semibold text-foreground"
          style={{
            WebkitTextStroke: '3px rgba(255,255,255,0.98)',
            paintOrder: 'stroke fill',
            textShadow: '0 1px 6px rgba(255,255,255,0.95), 0 0 10px rgba(255,255,255,0.9)',
          }}
        >
          {baseLabel}
        </div>
        {data.isHovered ? (
          <div
            className="mx-auto mt-1 max-w-[240px] text-xs leading-4 text-muted-foreground"
            style={{
              WebkitTextStroke: '2px rgba(255,255,255,0.96)',
              paintOrder: 'stroke fill',
              textShadow: '0 1px 6px rgba(255,255,255,0.92), 0 0 10px rgba(255,255,255,0.88)',
            }}
          >
            {data.workReference.reference.title}
          </div>
        ) : null}
      </div>
      <Handle
        id="center-target"
        type="target"
        position={Position.Left}
        isConnectableStart={false}
        isConnectableEnd={false}
        className="!pointer-events-none !z-0 !h-1 !w-1 !border-0 !bg-transparent !opacity-0"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
      />
      <Handle
        id="center-source"
        type="source"
        position={Position.Right}
        isConnectableStart={false}
        isConnectableEnd={false}
        className="!pointer-events-none !z-0 !h-1 !w-1 !border-0 !bg-transparent !opacity-0"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
      />
    </div>
  )
}

export const MAP_NODE_TYPES = Object.freeze({
  document: DocumentGraphNode,
  reference: ReferenceGraphNode,
})

export const MAP_EDGE_TYPES = Object.freeze({
  relationship: RelationshipEdge,
})
