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
import { ArrowRight, Plus } from 'lucide-react'
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
}
export type AnyGraphNodeData = GraphNodeData | ReferenceGraphNodeData

const MY_WORK_HEXAGON_CLIP_PATH = 'polygon(25% 6%, 75% 6%, 98% 50%, 75% 94%, 25% 94%, 2% 50%)'

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
  const zoom = useStore((state) => state.transform[2])
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  })
  const edgeData = (data ?? {}) as {
    confidence?: number
    isHovered?: boolean
    isConnectedToSelectedDocument?: boolean
    connectionDirection?: 'incoming' | 'outgoing' | null
    relationStatus?: string
  }
  const connectedDirection = edgeData.connectionDirection
  const connectedClasses = connectedDirection === 'outgoing'
    ? 'border-sky-300 bg-sky-50 text-sky-700'
    : connectedDirection === 'incoming'
      ? 'border-rose-300 bg-rose-50 text-rose-700'
      : 'border-slate-300 bg-white text-slate-700'
  const confidence = typeof edgeData.confidence === 'number'
    ? Math.round(edgeData.confidence * 100)
    : null
  const arrowAngle = Math.atan2(sourceY - targetY, sourceX - targetX) * (180 / Math.PI)

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerStart={markerStart} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          className={cn(
            'pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border shadow-sm',
            selected
              ? 'border-amber-300 bg-white text-amber-600'
              : edgeData.isConnectedToSelectedDocument
                ? connectedClasses
                : 'border-slate-200/80 bg-white/92 text-slate-500',
          )}
          style={{
            left: labelX,
            top: labelY,
            transform: `translate(-50%, -50%) rotate(${arrowAngle}deg) scale(${1 / Math.max(zoom, 0.001)})`,
            transformOrigin: 'center',
          }}
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </EdgeLabelRenderer>
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
  const {
    document,
    fillColor,
    borderColor,
    connectionDirection,
    isFocused,
    isHovered,
    isSearchMatch,
    isSelected,
    onStartConnection,
    pendingConnectionDirection,
  } = data
  const authorText = document.authors.length > 0
    ? document.authors.slice(0, 2).join(', ')
    : t('searchPage.unknownAuthor')
  const canCreateInboundLinks = document.documentType !== 'my_work'
  const isMyWork = document.documentType === 'my_work'

  return (
    <div
      data-document-node-id={document.id}
      className={cn(
        'relative z-10 flex h-full w-full items-center justify-center overflow-visible text-center shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur transition-all',
        isMyWork ? 'rounded-none' : 'rounded-full',
        pendingConnectionDirection && 'ring-4 ring-teal-100',
        isSelected && 'ring-4 ring-yellow-300 shadow-[0_0_0_10px_rgba(250,204,21,0.26),0_16px_40px_rgba(15,23,42,0.12)]',
        connectionDirection === 'outgoing' && !isSelected && 'ring-[5px] ring-sky-300 shadow-[0_0_0_10px_rgba(59,130,246,0.22),0_18px_44px_rgba(15,23,42,0.12)]',
        connectionDirection === 'incoming' && !isSelected && 'ring-[5px] ring-rose-300 shadow-[0_0_0_10px_rgba(244,63,94,0.2),0_18px_44px_rgba(15,23,42,0.12)]',
        isFocused && !isSelected && 'ring-4 ring-violet-100',
        isHovered && !isSelected && 'ring-2 ring-sky-100',
        isSearchMatch && 'shadow-[0_0_0_4px_rgba(245,158,11,0.18),0_16px_40px_rgba(15,23,42,0.08)]',
      )}
      style={{
        background: fillColor
          ? `radial-gradient(circle at 30% 20%, rgba(255,255,255,0.98), ${fillColor})`
          : undefined,
        border: `2px solid ${borderColor ?? '#cbd5e1'}`,
        clipPath: isMyWork ? MY_WORK_HEXAGON_CLIP_PATH : undefined,
      }}
    >
      {isMyWork && (isSelected || isHovered || isFocused || isSearchMatch || connectionDirection) ? (
        <div
          className={cn(
            'pointer-events-none absolute inset-[-10px] z-0',
            isSelected
              ? 'opacity-100'
              : isHovered || isFocused || isSearchMatch || connectionDirection
                ? 'opacity-85'
                : 'opacity-0',
          )}
          style={{
            clipPath: MY_WORK_HEXAGON_CLIP_PATH,
            background: isSelected
              ? 'rgba(250, 204, 21, 0.24)'
              : connectionDirection === 'outgoing'
                ? 'rgba(59, 130, 246, 0.18)'
                : connectionDirection === 'incoming'
                  ? 'rgba(244, 63, 94, 0.18)'
                  : isFocused
                    ? 'rgba(124, 58, 237, 0.16)'
                    : isSearchMatch
                      ? 'rgba(245, 158, 11, 0.16)'
                      : 'rgba(14, 165, 233, 0.14)',
            filter: isSelected
              ? 'drop-shadow(0 0 20px rgba(250, 204, 21, 0.48))'
              : 'drop-shadow(0 0 12px rgba(15, 23, 42, 0.12))',
          }}
        />
      ) : null}

      <div className={cn('space-y-2', isMyWork ? 'px-14 py-6' : 'px-5')}>
        <p className={cn('font-semibold text-slate-900', isMyWork ? 'line-clamp-4 text-[18px] leading-[1.05]' : 'line-clamp-3 text-sm leading-5')}>
          {document.title}
        </p>
        <p className={cn('text-slate-700', isMyWork ? 'line-clamp-2 text-[13px] leading-[1.2]' : 'line-clamp-2 text-xs leading-5')}>{authorText}</p>
        <div className={cn('flex items-center justify-center gap-2 uppercase tracking-[0.18em] text-slate-600', isMyWork ? 'text-[11px]' : 'text-[10px]')}>
          {document.year ? <span>{document.year}</span> : null}
        </div>
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
        <div className="group/link-actions absolute -top-9 left-1/2 z-30 -translate-x-1/2">
          <div className="flex flex-col items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-400 bg-amber-300 text-black shadow-sm transition group-hover/link-actions:border-amber-500 group-hover/link-actions:bg-amber-400">
                  <Plus className="h-4 w-4" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={8}>{t('mapsPage.addOrConnect')}</TooltipContent>
            </Tooltip>
            <div
              className={cn(
                'flex items-center gap-3 transition',
                pendingConnectionDirection
                  ? 'pointer-events-auto opacity-100'
                  : 'pointer-events-none opacity-0 group-hover/link-actions:pointer-events-auto group-hover/link-actions:opacity-100',
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
  return (
    <div
      className={cn(
        'flex h-full w-full items-center justify-center rounded-full border-2 border-dashed bg-background/95 px-4 text-center shadow-sm backdrop-blur transition-all',
        selected && 'ring-4 ring-amber-300 shadow-[0_0_0_8px_rgba(251,191,36,0.18)]',
        data.isHovered && !selected && 'ring-2 ring-sky-100 shadow-[0_0_0_6px_rgba(14,165,233,0.12)]',
      )}
    >
      <div className="space-y-2">
        <p className="line-clamp-3 text-sm font-semibold leading-5 text-slate-900">
          {data.workReference.reference.title}
        </p>
        <p className="line-clamp-2 text-xs leading-5 text-slate-600">
          {data.label}
        </p>
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
