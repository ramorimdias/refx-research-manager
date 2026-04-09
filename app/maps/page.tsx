'use client'

import Link from 'next/link'
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Node,
  type OnConnect,
  type OnConnectEnd,
  type OnConnectStart,
  type OnEdgesChange,
  type OnNodesChange,
  type NodeMouseHandler,
  type NodeDragHandler,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  Check,
  ChevronDown,
  ChevronUp,
  GitBranch,
  Loader2,
  Plus,
  Save,
  Trash2,
  WandSparkles,
  ChevronsUpDown,
  Waypoints,
} from 'lucide-react'
import { DocumentGraphControls } from '@/components/refx/document-graph-controls'
import { DocumentGraphPanel } from '@/components/refx/document-graph-panel'
import { EmptyState } from '@/components/refx/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useLibraryStore } from '@/lib/stores/library-store'
import { useDocumentActions, useDocumentStore } from '@/lib/stores/document-store'
import { useGraphActions, useGraphStore } from '@/lib/stores/graph-store'
import { useRelationActions, useRelationStore } from '@/lib/stores/relation-store'
import * as repo from '@/lib/repositories/local-db'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  buildDocumentGraphMetrics,
  buildNodeAppearance,
  deriveGraphView,
  runReheatLayout,
  type GraphColorMode,
  type GraphNeighborhoodDepth,
  type GraphRelationFilter,
  type GraphScopeMode,
  type GraphSizeMode,
} from '@/lib/services/document-graph-view-service'
import {
  buildDocumentGraphEdges,
  buildDocumentGraphNodes,
  type DocumentGraphNodeData,
} from '@/lib/services/document-relation-service'
import { formatReference } from '@/lib/services/work-reference-service'
import type { GraphView, GraphViewNodeLayout } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/localization'
import {
  MAP_EDGE_TYPES as FLOW_EDGE_TYPES,
  MAP_NODE_TYPES as FLOW_NODE_TYPES,
  type AnyGraphNodeData,
  type ConnectionDirection,
  type ReferenceGraphNodeData,
} from '@/components/refx/map-flow-types'

type GraphPreferences = {
  colorMode: GraphColorMode
  confidenceThreshold: number
  focusMode: boolean
  hideOrphans: boolean
  neighborhoodDepth: GraphNeighborhoodDepth
  relationFilter: GraphRelationFilter
  scopeMode: GraphScopeMode
  sizeMode: GraphSizeMode
  yearMax?: number
  yearMin?: number
}

type GraphViewDraft = {
  name: string
  description: string
}

type GraphContextMenuState =
  | {
      kind: 'node'
      documentId: string
      x: number
      y: number
    }
  | {
      kind: 'edge'
      relationId: string
      x: number
      y: number
    }
  | null

const GRAPH_PREFERENCES_STORAGE_KEY = 'refx.maps.phase4.preferences'
const WORKING_MAP_LAYOUT_STORAGE_KEY = 'refx.maps.working-layouts'
const LAST_ACTIVE_MAP_STORAGE_KEY = 'refx.maps.last-active-map'
const WORKING_MAP_SELECT_VALUE = '__working__'
const MY_WORK_HEXAGON_CLIP_PATH = 'polygon(25% 6%, 75% 6%, 98% 50%, 75% 94%, 25% 94%, 2% 50%)'
const GRAPH_POSITION_LIMIT = 12000
const DEFAULT_GRAPH_PREFERENCES: GraphPreferences = {
  colorMode: 'density',
  confidenceThreshold: 0,
  focusMode: false,
  hideOrphans: false,
  neighborhoodDepth: 'full',
  relationFilter: 'all',
  scopeMode: 'mapped',
  sizeMode: 'total_degree',
}

const DEFAULT_GRAPH_VIEW_DRAFT: GraphViewDraft = {
  name: '',
  description: '',
}

type WorkingMapLayouts = Record<string, Record<string, { x: number; y: number }>>

/*
function resolveEdgeDirections(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
) {
  const deltaX = targetX - sourceX
  const deltaY = targetY - sourceY

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return {
      sourcePosition: deltaX >= 0 ? Position.Right : Position.Left,
      targetPosition: deltaX >= 0 ? Position.Left : Position.Right,
    }
  }

  return {
    sourcePosition: deltaY >= 0 ? Position.Bottom : Position.Top,
    targetPosition: deltaY >= 0 ? Position.Top : Position.Bottom,
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
  const zoom = useStore((state) => state.transform[2])
  const { sourcePosition, targetPosition } = resolveEdgeDirections(
    sourceX,
    sourceY,
    targetX,
    targetY,
  )
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
                Confidence {confidence}%{edgeData.relationStatus ? ` • ${edgeData.relationStatus.replace(/_/g, ' ')}` : ''}
              </p>
            ) : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}

function DocumentGraphNode({ data, selected }: NodeProps<GraphNodeData>) {
  const t = useT()
  const {
    document,
    fillColor,
    borderColor,
    connectionDirection,
    isCurrentDocument,
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

const MAP_NODE_TYPES = Object.freeze({
  document: DocumentGraphNode,
  reference: ReferenceGraphNode,
})

const MAP_EDGE_TYPES = Object.freeze({
  relationship: RelationshipEdge,
})
*/

function preserveNodePositions(
  nextNodes: Node<AnyGraphNodeData>[],
  currentNodes: Node<AnyGraphNodeData>[],
  lockedPositions?: Map<string, { x: number; y: number }>,
) {
  const positions = new Map(currentNodes.map((node) => [node.id, node.position]))

  return nextNodes.map((node) => ({
    ...node,
    position: lockedPositions?.get(node.id) ?? positions.get(node.id) ?? node.position,
  }))
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left === right) return true
  if (left.length !== right.length) return false

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }

  return true
}

function areGraphPreferencesEqual(left: GraphPreferences, right: GraphPreferences) {
  return (
    left.colorMode === right.colorMode
    && left.confidenceThreshold === right.confidenceThreshold
    && left.focusMode === right.focusMode
    && left.hideOrphans === right.hideOrphans
    && left.neighborhoodDepth === right.neighborhoodDepth
    && left.relationFilter === right.relationFilter
    && left.scopeMode === right.scopeMode
    && left.sizeMode === right.sizeMode
    && left.yearMin === right.yearMin
    && left.yearMax === right.yearMax
  )
}

function sanitizeGraphPosition(
  position?: { x: unknown; y: unknown } | null,
  fallback?: { x: number; y: number },
) {
  if (!position) return fallback ?? null

  const rawX = typeof position.x === 'number' ? position.x : Number(position.x)
  const rawY = typeof position.y === 'number' ? position.y : Number(position.y)

  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
    return fallback ?? null
  }

  return {
    x: Math.max(-GRAPH_POSITION_LIMIT, Math.min(GRAPH_POSITION_LIMIT, rawX)),
    y: Math.max(-GRAPH_POSITION_LIMIT, Math.min(GRAPH_POSITION_LIMIT, rawY)),
  }
}

function readStoredGraphPreferences() {
  if (typeof window === 'undefined') return DEFAULT_GRAPH_PREFERENCES

  try {
    const raw = window.localStorage.getItem(GRAPH_PREFERENCES_STORAGE_KEY)
    if (!raw) return DEFAULT_GRAPH_PREFERENCES
    return {
      ...DEFAULT_GRAPH_PREFERENCES,
      ...(JSON.parse(raw) as Partial<GraphPreferences>),
    }
  } catch {
    return DEFAULT_GRAPH_PREFERENCES
  }
}

function readWorkingMapLayouts() {
  if (typeof window === 'undefined') return {} as WorkingMapLayouts

  try {
    const raw = window.localStorage.getItem(WORKING_MAP_LAYOUT_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as WorkingMapLayouts

    return Object.fromEntries(
      Object.entries(parsed).map(([libraryId, layouts]) => [
        libraryId,
        Object.fromEntries(
          Object.entries(layouts ?? {}).flatMap(([nodeId, position]) => {
            const normalized = sanitizeGraphPosition(position)
            return normalized ? [[nodeId, normalized] as const] : []
          }),
        ),
      ]),
    ) as WorkingMapLayouts
  } catch {
    return {}
  }
}

function writeWorkingMapLayouts(value: WorkingMapLayouts) {
  if (typeof window === 'undefined') return
  const normalized = Object.fromEntries(
    Object.entries(value).map(([libraryId, layouts]) => [
      libraryId,
      Object.fromEntries(
        Object.entries(layouts ?? {}).flatMap(([nodeId, position]) => {
          const sanitized = sanitizeGraphPosition(position)
          return sanitized ? [[nodeId, sanitized] as const] : []
        }),
      ),
    ]),
  )

  window.localStorage.setItem(WORKING_MAP_LAYOUT_STORAGE_KEY, JSON.stringify(normalized))
}

function readLastActiveMaps() {
  if (typeof window === 'undefined') return {} as Record<string, string>

  try {
    const raw = window.localStorage.getItem(LAST_ACTIVE_MAP_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return {}
  }
}

function writeLastActiveMaps(value: Record<string, string>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LAST_ACTIVE_MAP_STORAGE_KEY, JSON.stringify(value))
}

function MapsPageContent() {
  const t = useT()
  const params = useSearchParams()
  const focusDocumentId = params.get('focus')
  const reactFlow = useReactFlow<AnyGraphNodeData>()
  const activeDocumentId = useDocumentStore((state) => state.activeDocumentId)
  const documents = useDocumentStore((state) => state.documents)
  const activeLibraryId = useLibraryStore((state) => state.activeLibraryId)
  const libraries = useLibraryStore((state) => state.libraries)
  const graphViewLayouts = useGraphStore((state) => state.graphViewLayouts)
  const graphViews = useGraphStore((state) => state.graphViews)
  const relations = useRelationStore((state) => state.relations)
  const { createDocumentRecord, setActiveDocument } = useDocumentActions()
  const {
    loadGraphViewLayouts,
    loadGraphViews,
    createGraphView,
    updateGraphView,
    duplicateGraphView,
    deleteGraphView,
    upsertGraphViewNodeLayout,
    resetGraphViewNodeLayouts,
  } = useGraphActions()
  const { createRelation, updateRelation, deleteRelation } = useRelationActions()

  const [graphPreferences, setGraphPreferences] = useState<GraphPreferences>(DEFAULT_GRAPH_PREFERENCES)
  const [nodes, setNodes, onNodesChange] = useNodesState<AnyGraphNodeData>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [hoveredDocumentId, setHoveredDocumentId] = useState<string | null>(null)
  const [hoveredWorkReferenceId, setHoveredWorkReferenceId] = useState<string | null>(null)
  const [hoveredRelationId, setHoveredRelationId] = useState<string | null>(null)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(focusDocumentId)
  const [selectedWorkReferenceId, setSelectedWorkReferenceId] = useState<string | null>(null)
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(null)
  const [manualVisibleDocumentIds, setManualVisibleDocumentIds] = useState<string[]>([])
  const [hiddenDocumentIds, setHiddenDocumentIds] = useState<string[]>([])
  const [activeGraphViewId, setActiveGraphViewId] = useState<string | null>(null)
  const [pendingConnectionDocumentId, setPendingConnectionDocumentId] = useState<string | null>(null)
  const [pendingConnectionDirection, setPendingConnectionDirection] = useState<ConnectionDirection | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isAddDocumentPopoverOpen, setIsAddDocumentPopoverOpen] = useState(false)
  const [addDocumentQuery, setAddDocumentQuery] = useState('')
  const [pendingConnectionCursor, setPendingConnectionCursor] = useState<{ x: number; y: number } | null>(null)
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const [isDeletingRelation, setIsDeletingRelation] = useState(false)
  const [pendingDeleteRelationId, setPendingDeleteRelationId] = useState<string | null>(null)
  const [pendingDeleteAllLinksDocumentId, setPendingDeleteAllLinksDocumentId] = useState<string | null>(null)
  const [isDeleteWorkspaceDialogOpen, setIsDeleteWorkspaceDialogOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<GraphContextMenuState>(null)
  const [isReheatingLayout, setIsReheatingLayout] = useState(false)
  const [isTopBarCollapsed, setIsTopBarCollapsed] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [isCreateMapDialogOpen, setIsCreateMapDialogOpen] = useState(false)
  const [isSaveViewDialogOpen, setIsSaveViewDialogOpen] = useState(false)
  const [isEditingViewDialogOpen, setIsEditingViewDialogOpen] = useState(false)
  const [graphViewDraft, setGraphViewDraft] = useState<GraphViewDraft>(DEFAULT_GRAPH_VIEW_DRAFT)
  const [selectedMyWorkPickerResetKey, setSelectedMyWorkPickerResetKey] = useState(0)
  const [workReferencesByDocumentId, setWorkReferencesByDocumentId] = useState<Record<string, repo.DbWorkReference[]>>({})
  const [workingLayoutPositions, setWorkingLayoutPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [pendingDocumentPlacements, setPendingDocumentPlacements] = useState<Record<string, { x: number; y: number }>>({})
  const dragConnectionSourceIdRef = useRef<string | null>(null)
  const dragConnectionHandleIdRef = useRef<string | null>(null)
  const dragConnectionCompletedRef = useRef(false)
  const lastAutoFitKeyRef = useRef<string | null>(null)
  const pendingPlacementCommitIdsRef = useRef<Set<string>>(new Set())
  const recentlyRevealedDocumentIdRef = useRef<string | null>(null)

  useEffect(() => {
    setGraphPreferences(readStoredGraphPreferences())
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return

    const root = document.documentElement
    const updateTheme = () => setIsDarkMode(root.classList.contains('dark'))
    updateTheme()

    const observer = new MutationObserver(updateTheme)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(GRAPH_PREFERENCES_STORAGE_KEY, JSON.stringify(graphPreferences))
  }, [graphPreferences])

  useEffect(() => {
    if (!activeLibraryId || activeGraphViewId) {
      if (activeGraphViewId) {
        setWorkingLayoutPositions({})
      }
      return
    }

    const storedLayouts = readWorkingMapLayouts()
    setWorkingLayoutPositions(storedLayouts[activeLibraryId] ?? {})
  }, [activeGraphViewId, activeLibraryId])

  useEffect(() => {
    if (!activeLibraryId) return
    void loadGraphViews(activeLibraryId)
  }, [activeLibraryId, loadGraphViews])

  useEffect(() => {
    if (!activeGraphViewId) {
      void loadGraphViewLayouts(null)
      return
    }
    void loadGraphViewLayouts(activeGraphViewId)
  }, [activeGraphViewId, loadGraphViewLayouts])

  const activeLibrary = useMemo(
    () => libraries.find((library) => library.id === activeLibraryId) ?? libraries[0] ?? null,
    [activeLibraryId, libraries],
  )

  const myWorkDocuments = useMemo(
    () =>
      documents
        .filter((document) => document.documentType === 'my_work')
        .sort((left, right) => left.title.localeCompare(right.title)),
    [documents],
  )

  const activeLibraryGraphViews = useMemo(
    () => graphViews.filter((view) => view.libraryId === activeLibrary?.id),
    [activeLibrary?.id, graphViews],
  )

  const activeGraphView = useMemo(
    () => activeLibraryGraphViews.find((view) => view.id === activeGraphViewId) ?? null,
    [activeGraphViewId, activeLibraryGraphViews],
  )

  useEffect(() => {
    if (!activeLibraryId) return
    const storedMapId = readLastActiveMaps()[activeLibraryId]
    if (storedMapId === undefined) return

    if (storedMapId === '__working__') {
      if (activeGraphViewId !== null) {
        setActiveGraphViewId(null)
      }
      return
    }

    if (storedMapId !== activeGraphViewId && activeLibraryGraphViews.some((view) => view.id === storedMapId)) {
      setActiveGraphViewId(storedMapId)
    }
  }, [activeLibraryGraphViews, activeLibraryId])

  useEffect(() => {
    if (!activeLibraryId) return

    const storedMapIds = readLastActiveMaps()
    const nextMapId = activeGraphViewId ?? '__working__'
    if (storedMapIds[activeLibraryId] === nextMapId) return

    writeLastActiveMaps({
      ...storedMapIds,
      [activeLibraryId]: nextMapId,
    })
  }, [activeGraphViewId, activeLibraryId])

  useEffect(() => {
    if (!activeGraphView) {
      return
    }

    const nextPreferences: GraphPreferences = {
      colorMode: activeGraphView.colorMode,
      confidenceThreshold: 0,
      focusMode: activeGraphView.neighborhoodDepth !== 'full',
      hideOrphans: false,
      neighborhoodDepth: activeGraphView.neighborhoodDepth,
      relationFilter: 'all',
      scopeMode: 'mapped',
      sizeMode: activeGraphView.sizeMode,
      yearMin: activeGraphView.yearMin,
      yearMax: activeGraphView.yearMax,
    }
    const nextSelectedDocumentId = activeGraphView.selectedDocumentId ?? null

    setGraphPreferences((currentPreferences) => (
      areGraphPreferencesEqual(currentPreferences, nextPreferences) ? currentPreferences : nextPreferences
    ))
    setManualVisibleDocumentIds((currentIds) => (
      areStringArraysEqual(currentIds, activeGraphView.documentIds) ? currentIds : activeGraphView.documentIds
    ))
    setSelectedDocumentId((currentId) => (
      currentId === nextSelectedDocumentId ? currentId : nextSelectedDocumentId
    ))
  }, [activeGraphView])

  useEffect(() => {
    if (!activeGraphView) return

    const nextHiddenDocumentIds = graphViewLayouts
      .filter((layout) => layout.graphViewId === activeGraphView.id && layout.hidden)
      .map((layout) => layout.documentId)

    setHiddenDocumentIds((currentIds) => (
      areStringArraysEqual(currentIds, nextHiddenDocumentIds) ? currentIds : nextHiddenDocumentIds
    ))
  }, [activeGraphView, graphViewLayouts])

  const libraryDocuments = useMemo(() => {
    if (!activeLibrary) return []
    return documents.filter((document) => document.libraryId === activeLibrary.id)
  }, [activeLibrary, documents])

  const libraryDocumentIds = useMemo(
    () => new Set(libraryDocuments.map((document) => document.id)),
    [libraryDocuments],
  )

  const libraryRelations = useMemo(
    () =>
      relations.filter(
        (relation) =>
          libraryDocumentIds.has(relation.sourceDocumentId)
          && libraryDocumentIds.has(relation.targetDocumentId),
      ),
    [libraryDocumentIds, relations],
  )

  const derivedGraphView = useMemo(
    () =>
      deriveGraphView({
        documents: libraryDocuments,
        relations: libraryRelations,
        relationFilter: 'all',
        confidenceThreshold: 0,
        selectedDocumentId,
        neighborhoodDepth: graphPreferences.neighborhoodDepth,
        focusMode: graphPreferences.neighborhoodDepth !== 'full',
        scopeMode: 'mapped',
        manualVisibleDocumentIds,
        hiddenDocumentIds,
        yearMin: graphPreferences.yearMin,
        yearMax: graphPreferences.yearMax,
        hideOrphans: graphPreferences.hideOrphans,
        searchQuery: deferredSearchQuery,
      }),
    [deferredSearchQuery, graphPreferences, hiddenDocumentIds, libraryDocuments, libraryRelations, manualVisibleDocumentIds, selectedDocumentId],
  )
  const hiddenDocumentIdSet = useMemo(() => new Set(hiddenDocumentIds), [hiddenDocumentIds])

  const visibleDocuments = useMemo(() => {
    const scopedIds = new Set([
      ...manualVisibleDocumentIds,
      ...(selectedDocumentId ? [selectedDocumentId] : []),
    ])
    const isWithinYearRange = (document: typeof libraryDocuments[number]) => {
      if (graphPreferences.yearMin !== undefined && (document.year ?? Number.MIN_SAFE_INTEGER) < graphPreferences.yearMin) return false
      if (graphPreferences.yearMax !== undefined && (document.year ?? Number.MAX_SAFE_INTEGER) > graphPreferences.yearMax) return false
      return true
    }
    const manuallyVisibleDocuments = libraryDocuments.filter((document) => (
      scopedIds.has(document.id)
      && !hiddenDocumentIdSet.has(document.id)
    ))
    const documentsWithBibliography = libraryDocuments.filter((document) =>
      document.documentType === 'my_work'
      && scopedIds.has(document.id)
      && (workReferencesByDocumentId[document.id]?.length ?? 0) > 0,
    )

    const matchedReferenceDocuments = documentsWithBibliography
      .flatMap((document) => workReferencesByDocumentId[document.id] ?? [])
      .map((reference) => (
        reference.matchedDocumentId
          ? libraryDocuments.find((document) => document.id === reference.matchedDocumentId) ?? null
          : null
      ))
      .filter((document): document is NonNullable<typeof document> => Boolean(document))
      .filter((document, index, documents) => (
        !hiddenDocumentIdSet.has(document.id)
        && isWithinYearRange(document)
        && documents.findIndex((candidate) => candidate.id === document.id) === index
      ))

    return [...derivedGraphView.documents, ...manuallyVisibleDocuments, ...documentsWithBibliography, ...matchedReferenceDocuments].filter((document, index, documents) => (
      documents.findIndex((candidate) => candidate.id === document.id) === index
    ))
  }, [
    derivedGraphView.documents,
    graphPreferences.yearMax,
    graphPreferences.yearMin,
    hiddenDocumentIdSet,
    libraryDocuments,
    manualVisibleDocumentIds,
    selectedDocumentId,
    workReferencesByDocumentId,
  ])
  const visibleDocumentIdSet = useMemo(
    () => new Set(visibleDocuments.map((document) => document.id)),
    [visibleDocuments],
  )
  const visibleRelations = useMemo(() => {
    const derivedRelationIds = new Set(derivedGraphView.relations.map((relation) => relation.id))
    const supplementalRelations = libraryRelations.filter((relation) =>
      visibleDocumentIdSet.has(relation.sourceDocumentId)
      && visibleDocumentIdSet.has(relation.targetDocumentId)
      && !derivedRelationIds.has(relation.id),
    )

    return [...derivedGraphView.relations, ...supplementalRelations]
  }, [derivedGraphView.relations, libraryRelations, visibleDocumentIdSet])
  const visibleMetrics = useMemo(
    () => buildDocumentGraphMetrics(visibleDocuments, visibleRelations),
    [visibleDocuments, visibleRelations],
  )
  const searchMatches = derivedGraphView.searchMatches
  const visibleWorkReferences = useMemo(
    () =>
      visibleDocuments
        .filter((document) => document.documentType === 'my_work')
        .flatMap((document) => workReferencesByDocumentId[document.id] ?? []),
    [visibleDocuments, workReferencesByDocumentId],
  )
  const visibleCanvasNodeKey = useMemo(
    () =>
      nodes
        .filter((node) => node.type === 'document' || node.type === 'reference')
        .map((node) => `${node.type}:${node.id}`)
        .sort()
        .join('|'),
    [nodes],
  )

  const addableDocuments = useMemo(
    () => libraryDocuments.filter((document) => !visibleDocuments.some((entry) => entry.id === document.id)),
    [libraryDocuments, visibleDocuments],
  )
  const filteredAddableDocuments = useMemo(() => {
    const query = addDocumentQuery.trim().toLowerCase()
    if (!query) return addableDocuments

    return addableDocuments.filter((document) => {
      const haystack = [
        document.title,
        document.authors.join(' '),
        document.year ? String(document.year) : '',
      ].join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }, [addDocumentQuery, addableDocuments])

  const selectedDocument = useMemo(
    () => libraryDocuments.find((document) => document.id === selectedDocumentId) ?? null,
    [libraryDocuments, selectedDocumentId],
  )

  useEffect(() => {
    let cancelled = false

    const loadWorkReferences = async () => {
      const workDocumentsInLibrary = libraryDocuments.filter((document) => document.documentType === 'my_work')
      if (workDocumentsInLibrary.length === 0) {
        setWorkReferencesByDocumentId({})
        return
      }

      try {
        const results = await Promise.all(
          workDocumentsInLibrary.map(async (document) => [document.id, await repo.listWorkReferences(document.id)] as const),
        )
        if (!cancelled) {
          setWorkReferencesByDocumentId(Object.fromEntries(results))
        }
      } catch {
        if (!cancelled) {
          setWorkReferencesByDocumentId({})
        }
      }
    }

    void loadWorkReferences()
    return () => {
      cancelled = true
    }
  }, [libraryDocuments])

  const selectedWorkReferences = useMemo(
    () => (selectedDocument?.documentType === 'my_work' ? workReferencesByDocumentId[selectedDocument.id] ?? [] : []),
    [selectedDocument, workReferencesByDocumentId],
  )
  const allWorkReferencesById = useMemo(
    () =>
      new Map(
        Object.values(workReferencesByDocumentId)
          .flat()
          .map((reference) => [reference.id, reference] as const),
      ),
    [workReferencesByDocumentId],
  )

  const selectedRelation = useMemo(
    () => libraryRelations.find((relation) => relation.id === selectedRelationId) ?? null,
    [libraryRelations, selectedRelationId],
  )

  const pendingDeleteRelation = useMemo(
    () => libraryRelations.find((relation) => relation.id === pendingDeleteRelationId) ?? null,
    [libraryRelations, pendingDeleteRelationId],
  )

  const pendingDeleteAllLinksCount = useMemo(
    () =>
      pendingDeleteAllLinksDocumentId
        ? libraryRelations.filter(
          (relation) =>
            relation.sourceDocumentId === pendingDeleteAllLinksDocumentId
            || relation.targetDocumentId === pendingDeleteAllLinksDocumentId,
        ).length
        : 0,
    [libraryRelations, pendingDeleteAllLinksDocumentId],
  )

  const selectedWorkReference = useMemo(
    () => (selectedWorkReferenceId ? allWorkReferencesById.get(selectedWorkReferenceId) ?? null : null),
    [allWorkReferencesById, selectedWorkReferenceId],
  )

  const graphViewLayoutMap = useMemo(
    () =>
      new Map(
        graphViewLayouts
          .filter((layout) => !activeGraphViewId || layout.graphViewId === activeGraphViewId)
          .flatMap((layout) => {
            const normalizedPosition = sanitizeGraphPosition({ x: layout.x, y: layout.y })
            if (!normalizedPosition) return []

            return [[
              layout.documentId,
              {
                ...layout,
                x: normalizedPosition.x,
                y: normalizedPosition.y,
              },
            ] as const]
          }),
      ),
    [activeGraphViewId, graphViewLayouts],
  )

  const effectiveLayoutMap = useMemo(() => {
    const workingLayoutMap = new Map(
      Object.entries(workingLayoutPositions).flatMap(([nodeId, position]) => {
        const normalizedPosition = sanitizeGraphPosition(position)
        if (!normalizedPosition) return []

        return [[
          nodeId,
          {
            documentId: nodeId,
            graphViewId: '__working__',
            hidden: false,
            pinned: false,
            updatedAt: new Date(),
            x: normalizedPosition.x,
            y: normalizedPosition.y,
          },
        ] as const]
      }),
    )
    const pendingLayoutMap = new Map(
      Object.entries(pendingDocumentPlacements).flatMap(([nodeId, position]) => {
        const normalizedPosition = sanitizeGraphPosition(position)
        if (!normalizedPosition) return []

        return [[
          nodeId,
          {
            documentId: nodeId,
            graphViewId: activeGraphViewId ?? '__working__',
            hidden: false,
            pinned: false,
            updatedAt: new Date(),
            x: normalizedPosition.x,
            y: normalizedPosition.y,
          },
        ] as const]
      }),
    )

    if (!activeGraphViewId) return new Map([...workingLayoutMap.entries(), ...pendingLayoutMap.entries()])

    return new Map([
      ...graphViewLayoutMap.entries(),
      ...workingLayoutMap.entries(),
      ...pendingLayoutMap.entries(),
    ])
  }, [activeGraphViewId, graphViewLayoutMap, pendingDocumentPlacements, workingLayoutPositions])

  const sourceDocument = useMemo(
    () =>
      selectedRelation
        ? libraryDocuments.find((document) => document.id === selectedRelation.sourceDocumentId) ?? null
        : null,
    [libraryDocuments, selectedRelation],
  )

  const targetDocument = useMemo(
    () =>
      selectedRelation
        ? libraryDocuments.find((document) => document.id === selectedRelation.targetDocumentId) ?? null
        : null,
    [libraryDocuments, selectedRelation],
  )
  const isSelectionPanelOpen = Boolean(selectedDocument || selectedRelation || selectedWorkReference)

  const clearSelection = () => {
    setSelectedDocumentId(null)
    setSelectedWorkReferenceId(null)
    setSelectedRelationId(null)
    setContextMenu(null)
    setActiveDocument(null)
  }

  const searchResults = useMemo(
    () =>
      visibleDocuments.filter((document) =>
        deferredSearchQuery.trim().length > 0
        && document.title.toLowerCase().includes(deferredSearchQuery.trim().toLowerCase()),
      ),
    [deferredSearchQuery, visibleDocuments],
  )

  const selectedDocumentIncomingDocuments = useMemo(
    () =>
      selectedDocument
        ? libraryRelations
          .filter((relation) => relation.targetDocumentId === selectedDocument.id)
          .map((relation) => libraryDocuments.find((document) => document.id === relation.sourceDocumentId) ?? null)
          .filter((document, index, documents): document is NonNullable<typeof document> => (
            Boolean(document) && documents.findIndex((candidate) => candidate?.id === document?.id) === index
          ))
        : [],
    [libraryDocuments, libraryRelations, selectedDocument],
  )
  const selectedDocumentOutgoingDocuments = useMemo(
    () => {
      if (!selectedDocument) return []

      const linkedDocuments = libraryRelations
        .filter((relation) => relation.sourceDocumentId === selectedDocument.id)
        .map((relation) => libraryDocuments.find((document) => document.id === relation.targetDocumentId) ?? null)
        .filter((document, index, documents): document is NonNullable<typeof document> => (
          Boolean(document) && documents.findIndex((candidate) => candidate?.id === document?.id) === index
        ))

      if (selectedDocument.documentType !== 'my_work') {
        return linkedDocuments
      }

      const referenceMatchedDocuments = selectedWorkReferences
        .map((reference) => (
          reference.matchedDocumentId
            ? libraryDocuments.find((document) => document.id === reference.matchedDocumentId) ?? null
            : null
        ))
        .filter((document, index, documents): document is NonNullable<typeof document> => (
          Boolean(document) && documents.findIndex((candidate) => candidate?.id === document?.id) === index
        ))

      return [...linkedDocuments, ...referenceMatchedDocuments].filter((document, index, documents) => (
        documents.findIndex((candidate) => candidate.id === document.id) === index
      ))
    },
    [libraryDocuments, libraryRelations, selectedDocument, selectedWorkReferences],
  )
  const currentViewDocumentIdSet = useMemo(
    () => new Set(visibleDocuments.map((document) => document.id)),
    [visibleDocuments],
  )
  const selectedDocumentVisibleIncomingDocuments = useMemo(
    () => selectedDocumentIncomingDocuments.filter((document) => currentViewDocumentIdSet.has(document.id)),
    [currentViewDocumentIdSet, selectedDocumentIncomingDocuments],
  )
  const selectedDocumentOtherIncomingDocuments = useMemo(
    () => selectedDocumentIncomingDocuments.filter((document) => !currentViewDocumentIdSet.has(document.id)),
    [currentViewDocumentIdSet, selectedDocumentIncomingDocuments],
  )
  const selectedDocumentVisibleOutgoingDocuments = useMemo(
    () => selectedDocumentOutgoingDocuments.filter((document) => currentViewDocumentIdSet.has(document.id)),
    [currentViewDocumentIdSet, selectedDocumentOutgoingDocuments],
  )
  const selectedDocumentOtherOutgoingDocuments = useMemo(
    () => selectedDocumentOutgoingDocuments.filter((document) => !currentViewDocumentIdSet.has(document.id)),
    [currentViewDocumentIdSet, selectedDocumentOutgoingDocuments],
  )
  const selectedDocumentIncomingIds = useMemo(
    () => new Set(selectedDocumentIncomingDocuments.map((document) => document.id)),
    [selectedDocumentIncomingDocuments],
  )
  const selectedDocumentOutgoingIds = useMemo(
    () => new Set(selectedDocumentOutgoingDocuments.map((document) => document.id)),
    [selectedDocumentOutgoingDocuments],
  )
  const clearPendingConnection = () => {
    setPendingConnectionDocumentId(null)
    setPendingConnectionDirection(null)
    setPendingConnectionCursor(null)
    setIsAddDocumentPopoverOpen(false)
    setAddDocumentQuery('')
  }

  const handleStartConnection = (documentId: string, direction: ConnectionDirection) => {
    setSelectedRelationId(null)
    setSelectedDocumentId(documentId)

    const isSameSelection =
      pendingConnectionDocumentId === documentId && pendingConnectionDirection === direction

    if (isSameSelection) {
      clearPendingConnection()
      return
    }

    setPendingConnectionDocumentId(documentId)
    setPendingConnectionDirection(direction)
    setSearchQuery('')
    setIsAddDocumentPopoverOpen(true)
  }

  useEffect(() => {
    if (!focusDocumentId || !libraryDocumentIds.has(focusDocumentId)) return
    setManualVisibleDocumentIds((currentIds) => (
      currentIds.includes(focusDocumentId) ? currentIds : [...currentIds, focusDocumentId]
    ))
    setSelectedDocumentId(focusDocumentId)
  }, [focusDocumentId, libraryDocumentIds])

  useEffect(() => {
    if (selectedDocumentId && !libraryDocumentIds.has(selectedDocumentId)) {
      setSelectedDocumentId(null)
    }
  }, [libraryDocumentIds, selectedDocumentId])

  useEffect(() => {
    if (selectedRelationId && !libraryRelations.some((relation) => relation.id === selectedRelationId)) {
      setSelectedRelationId(null)
    }
  }, [libraryRelations, selectedRelationId])

  useEffect(() => {
    if (selectedWorkReferenceId && !allWorkReferencesById.has(selectedWorkReferenceId)) {
      setSelectedWorkReferenceId(null)
    }
  }, [allWorkReferencesById, selectedWorkReferenceId])

  useEffect(() => {
    if (visibleCanvasNodeKey.length === 0) {
      lastAutoFitKeyRef.current = null
      return
    }

    const fitKey = [
      activeLibrary?.id ?? '__none__',
      activeGraphViewId ?? '__working__',
      visibleCanvasNodeKey,
      edges.length,
    ].join(':')

    if (lastAutoFitKeyRef.current === fitKey) return
    lastAutoFitKeyRef.current = fitKey

    const frame = window.requestAnimationFrame(() => {
      reactFlow.fitView({ padding: 0.2, duration: 250 })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [
    activeGraphViewId,
    activeLibrary?.id,
    edges.length,
    reactFlow,
    visibleCanvasNodeKey,
  ])

  useEffect(() => {
    if (pendingConnectionDocumentId && !visibleDocuments.some((document) => document.id === pendingConnectionDocumentId)) {
      clearPendingConnection()
    }
  }, [pendingConnectionDocumentId, visibleDocuments])

  useEffect(() => {
    if (!pendingConnectionDirection) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      clearPendingConnection()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pendingConnectionDirection])

  useEffect(() => {
    const visibleWorkReferenceGroups = visibleDocuments
      .filter((document) => document.documentType === 'my_work')
      .map((document) => ({
        workDocumentId: document.id,
        references: workReferencesByDocumentId[document.id] ?? [],
      }))
      .filter((group) => group.references.length > 0)

    const appearance = Object.fromEntries(
      visibleDocuments.map((document) => {
        const metrics = visibleMetrics[document.id]
        const nodeAppearance = buildNodeAppearance({
          document,
          metrics,
          colorMode: graphPreferences.colorMode,
          sizeMode: graphPreferences.sizeMode,
          activeLibraryColor: activeLibrary?.color,
          currentDocumentId: activeDocumentId,
          isSelected: selectedDocumentId === document.id,
          isHovered: hoveredDocumentId === document.id,
          isFocused: graphPreferences.focusMode && selectedDocumentId === document.id,
          isSearchMatch: searchMatches.has(document.id),
        })

        return [document.id, {
          ...nodeAppearance,
          fillColor: document.documentType === 'my_work' ? '#fef08a' : nodeAppearance.fillColor,
          borderColor: document.documentType === 'my_work' ? '#eab308' : nodeAppearance.borderColor,
          inboundCitationCount: metrics?.inboundCitationCount ?? 0,
          outboundCitationCount: metrics?.outboundCitationCount ?? 0,
          connectionDirection: selectedDocumentOutgoingIds.has(document.id)
            ? 'outgoing'
            : selectedDocumentIncomingIds.has(document.id)
              ? 'incoming'
              : null,
          isCurrentDocument: activeDocumentId === document.id,
          isConnectedToSelectedDocument:
            selectedDocumentId != null
            && (selectedDocumentIncomingIds.has(document.id) || selectedDocumentOutgoingIds.has(document.id)),
          isDimmed: false,
          isFocused: graphPreferences.focusMode && selectedDocumentId === document.id,
          isHovered: hoveredDocumentId === document.id,
          isSearchMatch: searchMatches.has(document.id),
          isSelected: selectedDocumentId === document.id,
          sizePx: document.documentType === 'my_work'
            ? (nodeAppearance.sizePx ?? 220) + 96
            : nodeAppearance.sizePx,
        }]
      }),
    ) as Record<string, Partial<DocumentGraphNodeData>>

    const nextDocumentNodes = buildDocumentGraphNodes(visibleDocuments, visibleRelations, appearance).map((node) => {
      const savedLayout = effectiveLayoutMap.get(node.id)

      return {
        ...node,
        draggable: !savedLayout?.pinned,
        position: savedLayout ? { x: savedLayout.x, y: savedLayout.y } : node.position,
        data: {
          ...node.data,
          pendingConnectionDirection:
            node.id === pendingConnectionDocumentId ? pendingConnectionDirection : null,
          onStartConnection: handleStartConnection,
        },
      }
    })

    const referenceNodes: Node<ReferenceGraphNodeData>[] = visibleWorkReferenceGroups.flatMap((group) => {
      const workNode = nextDocumentNodes.find((node) => node.id === group.workDocumentId) ?? null

      return group.references
        .filter((reference) => !reference.matchedDocumentId)
        .map((reference, index) => ({
          id: `work-reference-node-${reference.id}`,
          type: 'reference',
          position: {
            x: (workNode?.position.x ?? 340) + 320 + (index % 2) * 40,
            y: (workNode?.position.y ?? 140) + index * 150,
          },
          draggable: true,
          selectable: true,
          data: {
            workReference: reference,
            label: formatReference(reference.reference, 'apa'),
            isSelected: selectedWorkReferenceId === reference.id,
            isHovered: hoveredWorkReferenceId === reference.id,
          },
          style: {
            width: 220,
            height: 220,
            borderRadius: 9999,
            border: '2px dashed oklch(0.72 0.01 250)',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(246,248,252,0.96) 100%)',
            boxShadow: '0 14px 32px rgba(15, 23, 42, 0.08)',
          },
        }))
    })

    const syntheticReferenceEdges = visibleWorkReferenceGroups.flatMap((group) =>
      group.references.map((reference) => {
        const targetId = reference.matchedDocumentId
          ? reference.matchedDocumentId
          : `work-reference-node-${reference.id}`
        const isUnmatched = !reference.matchedDocumentId

        return {
          id: `work-reference-edge-${reference.id}`,
          source: group.workDocumentId,
          target: targetId,
          sourceHandle: 'center-source',
          targetHandle: 'center-target',
          type: 'relationship',
          data: {
            relationStatus: isUnmatched ? 'reference_only' : 'matched_reference',
            isConnectedToSelectedDocument: selectedDocumentId === group.workDocumentId,
            connectionDirection: 'outgoing',
          },
          style: {
            stroke: isUnmatched ? '#64748b' : '#2563eb',
            strokeWidth: isUnmatched ? 2.4 : 3.4,
            opacity: 0.96,
          },
          markerStart: {
            type: MarkerType.ArrowClosed,
            width: isUnmatched ? 20 : 22,
            height: isUnmatched ? 20 : 22,
            color: isUnmatched ? '#64748b' : '#2563eb',
          },
          markerEnd: undefined,
          label: isUnmatched ? 'reference' : 'matched reference',
        }
      }),
    )

    const lockedPositions = isReheatingLayout
      ? undefined
      : new Map(
        Array.from(effectiveLayoutMap.values()).map((layout) => [layout.documentId, { x: layout.x, y: layout.y }]),
      )

    setNodes((currentNodes) => preserveNodePositions([...nextDocumentNodes, ...referenceNodes], currentNodes, lockedPositions))
    setEdges([
      ...buildDocumentGraphEdges(visibleRelations, selectedDocumentId, selectedRelationId, hoveredRelationId),
      ...syntheticReferenceEdges,
    ])
  }, [
    activeDocumentId,
    activeLibrary?.color,
    graphPreferences.colorMode,
    graphPreferences.focusMode,
    graphPreferences.sizeMode,
    hoveredDocumentId,
    hoveredWorkReferenceId,
    hoveredRelationId,
    pendingConnectionDirection,
    pendingConnectionDocumentId,
    searchMatches,
    selectedDocumentId,
    selectedDocumentIncomingIds,
    selectedDocumentOutgoingIds,
    selectedRelationId,
    selectedWorkReferenceId,
    workReferencesByDocumentId,
    setEdges,
    setNodes,
    effectiveLayoutMap,
    libraryDocuments,
    selectedDocument,
    visibleDocuments,
    visibleMetrics,
    visibleRelations,
  ])

  useEffect(() => {
    const pendingIds = Object.keys(pendingDocumentPlacements).filter(
      (documentId) => !pendingPlacementCommitIdsRef.current.has(documentId),
    )
    if (pendingIds.length === 0) return

    const readyNodes = pendingIds
      .map((documentId) => nodes.find((node) => node.type === 'document' && node.id === documentId) ?? null)
      .filter((node): node is Node<AnyGraphNodeData> => Boolean(node))

    if (readyNodes.length === 0) return
    readyNodes.forEach((node) => pendingPlacementCommitIdsRef.current.add(node.id))

    const persistPendingLayouts = async () => {
      try {
        await Promise.all(
          readyNodes.map(async (node) => {
            if (activeGraphViewId) {
              await upsertGraphViewNodeLayout({
                graphViewId: activeGraphViewId,
                documentId: node.id,
                x: node.position.x,
                y: node.position.y,
                hidden: false,
              })
              return
            }

            if (!activeLibraryId) return

            setWorkingLayoutPositions((currentLayouts) => {
              const nextLayouts = {
                ...currentLayouts,
                [node.id]: { x: node.position.x, y: node.position.y },
              }
              const storedLayouts = readWorkingMapLayouts()
              writeWorkingMapLayouts({
                ...storedLayouts,
                [activeLibraryId]: {
                  ...(storedLayouts[activeLibraryId] ?? {}),
                  ...nextLayouts,
                },
              })
              return nextLayouts
            })
          }),
        )
      } finally {
        setPendingDocumentPlacements((currentPlacements) => {
          const nextPlacements = { ...currentPlacements }
          readyNodes.forEach((node) => {
            delete nextPlacements[node.id]
            pendingPlacementCommitIdsRef.current.delete(node.id)
          })
          return nextPlacements
        })
      }
    }

    void persistPendingLayouts()
  }, [activeGraphViewId, activeLibraryId, nodes, pendingDocumentPlacements, upsertGraphViewNodeLayout])

  useEffect(() => {
    const recentlyRevealedDocumentId = recentlyRevealedDocumentIdRef.current
    if (!recentlyRevealedDocumentId) return

    const revealedNode = nodes.find((node) => node.type === 'document' && node.id === recentlyRevealedDocumentId)
    if (!revealedNode) return

    recentlyRevealedDocumentIdRef.current = null
    centerOnDocument(recentlyRevealedDocumentId)
  }, [nodes, reactFlow])

  const handleConnect: OnConnect = async (connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return
    dragConnectionCompletedRef.current = true
    const direction = connection.sourceHandle === 'inbound' ? 'inbound' : 'outbound'
    const sourceDocumentId = direction === 'inbound' ? connection.target : connection.source
    const targetDocumentId = direction === 'inbound' ? connection.source : connection.target
    const targetDocument = libraryDocuments.find((document) => document.id === targetDocumentId)
    if (targetDocument?.documentType === 'my_work') {
      clearPendingConnection()
      return
    }

    const created = await createRelation({
      sourceDocumentId,
      targetDocumentId,
      linkType: 'citation',
      linkOrigin: 'user',
    })

    if (!created) return

    setManualVisibleDocumentIds((currentIds) => Array.from(new Set([...currentIds, sourceDocumentId, targetDocumentId])))
    clearPendingConnection()
    setSelectedDocumentId(null)
    setSelectedRelationId(created.id)
  }

  const handleConnectStart: OnConnectStart = (_, params) => {
    dragConnectionCompletedRef.current = false
    dragConnectionHandleIdRef.current = params.handleId ?? null
    dragConnectionSourceIdRef.current = params.handleType === 'source' ? params.nodeId : null
  }

  const handleConnectEnd: OnConnectEnd = async (event) => {
    const sourceDocumentId = dragConnectionSourceIdRef.current
    const sourceHandleId = dragConnectionHandleIdRef.current
    dragConnectionSourceIdRef.current = null
    dragConnectionHandleIdRef.current = null

    if (dragConnectionCompletedRef.current) {
      dragConnectionCompletedRef.current = false
      return
    }
    if (!sourceDocumentId) return

    const rawTarget = event.target
    if (!(rawTarget instanceof Element)) return
    const targetDocumentId = rawTarget.closest('[data-document-node-id]')?.getAttribute('data-document-node-id')
    if (!targetDocumentId || targetDocumentId === sourceDocumentId) return
    const direction = sourceHandleId === 'inbound' ? 'inbound' : 'outbound'
    const relationSourceDocumentId = direction === 'inbound' ? targetDocumentId : sourceDocumentId
    const relationTargetDocumentId = direction === 'inbound' ? sourceDocumentId : targetDocumentId
    const targetDocument = libraryDocuments.find((document) => document.id === relationTargetDocumentId)
    if (targetDocument?.documentType === 'my_work') {
      clearPendingConnection()
      return
    }

    const created = await createRelation({
      sourceDocumentId: relationSourceDocumentId,
      targetDocumentId: relationTargetDocumentId,
      linkType: 'citation',
      linkOrigin: 'user',
    })

    if (!created) return

    setManualVisibleDocumentIds((currentIds) => Array.from(new Set([...currentIds, relationSourceDocumentId, relationTargetDocumentId])))
    clearPendingConnection()
    setSelectedDocumentId(null)
    setSelectedRelationId(created.id)
  }

  const handleClickToConnect = async (clickedDocumentId: string) => {
    if (!pendingConnectionDocumentId || !pendingConnectionDirection || pendingConnectionDocumentId === clickedDocumentId) return

    const sourceDocumentId =
      pendingConnectionDirection === 'outbound' ? pendingConnectionDocumentId : clickedDocumentId
    const targetDocumentId =
      pendingConnectionDirection === 'outbound' ? clickedDocumentId : pendingConnectionDocumentId
    const targetDocument = libraryDocuments.find((document) => document.id === targetDocumentId)
    if (targetDocument?.documentType === 'my_work') {
      clearPendingConnection()
      return
    }

    const created = await createRelation({
      sourceDocumentId,
      targetDocumentId,
      linkType: 'citation',
      linkOrigin: 'user',
    })

    if (!created) return

    setManualVisibleDocumentIds((currentIds) => Array.from(new Set([...currentIds, sourceDocumentId, targetDocumentId])))
    clearPendingConnection()
    setSelectedDocumentId(null)
    setSelectedRelationId(created.id)
  }

  const handleDeleteRelation = async (relationId: string) => {
    setPendingDeleteRelationId(relationId)
  }

  const handleDeleteRelationWithoutPrompt = async (relationId: string) => {
    setIsDeletingRelation(true)
    try {
      const deleted = await deleteRelation(relationId)
      if (deleted) {
        setSelectedRelationId((currentId) => (currentId === relationId ? null : currentId))
      }
    } finally {
      setIsDeletingRelation(false)
    }
  }

  const handleDeleteAllLinksForDocument = async (documentId: string) => {
    const connectedRelations = libraryRelations.filter(
      (relation) =>
        relation.sourceDocumentId === documentId || relation.targetDocumentId === documentId,
    )

    if (connectedRelations.length === 0) return

    setIsDeletingRelation(true)
    try {
      await Promise.all(connectedRelations.map((relation) => deleteRelation(relation.id)))
      setSelectedRelationId((currentId) =>
        currentId && connectedRelations.some((relation) => relation.id === currentId) ? null : currentId,
      )
      setPendingDeleteAllLinksDocumentId(null)
    } finally {
      setIsDeletingRelation(false)
    }
  }

  const handleInvertRelation = async (relationId: string) => {
    const relation = libraryRelations.find((entry) => entry.id === relationId)
    if (!relation) return

    const inverted = await createRelation({
      sourceDocumentId: relation.targetDocumentId,
      targetDocumentId: relation.sourceDocumentId,
      linkType: relation.linkType,
      linkOrigin: relation.linkOrigin,
      relationStatus: relation.relationStatus,
      confidence: relation.confidence,
      label: relation.label,
      notes: relation.notes,
      matchMethod: relation.matchMethod,
      rawReferenceText: relation.rawReferenceText,
      normalizedReferenceText: relation.normalizedReferenceText,
      normalizedTitle: relation.normalizedTitle,
      normalizedFirstAuthor: relation.normalizedFirstAuthor,
      referenceIndex: relation.referenceIndex,
      parseConfidence: relation.parseConfidence,
      parseWarnings: relation.parseWarnings,
      matchDebugInfo: relation.matchDebugInfo,
    })

    if (!inverted) return

    await handleDeleteRelationWithoutPrompt(relationId)
    setSelectedDocumentId(null)
    setSelectedRelationId(inverted.id)
  }

  const handleNodesChange: OnNodesChange = (changes) => onNodesChange(changes)
  const handleEdgesChange: OnEdgesChange = (changes) => onEdgesChange(changes)
  const handleNodeDragStart: NodeMouseHandler = (_, node) => {
    if (node.type === 'reference') {
      setSelectedDocumentId(null)
      setSelectedWorkReferenceId(node.id.replace('work-reference-node-', ''))
      setSelectedRelationId(null)
      setActiveDocument(null)
      return
    }

    if (node.type !== 'document') return
    setSelectedDocumentId(node.id)
    setSelectedWorkReferenceId(null)
    setSelectedRelationId(null)
    setActiveDocument(node.id)
  }
  const handleNodeDragStop: NodeDragHandler = async (_, node) => {
    if (node.type === 'reference') {
      if (!activeLibraryId) return

      setWorkingLayoutPositions((currentLayouts) => {
        const nextLayouts = {
          ...currentLayouts,
          [node.id]: { x: node.position.x, y: node.position.y },
        }
        const storedLayouts = readWorkingMapLayouts()
        writeWorkingMapLayouts({
          ...storedLayouts,
          [activeLibraryId]: {
            ...(storedLayouts[activeLibraryId] ?? {}),
            ...nextLayouts,
          },
        })
        return nextLayouts
      })
      return
    }

    if (node.type !== 'document') return
    if (activeGraphViewId) {
      const existingLayout = graphViewLayoutMap.get(node.id)
      await upsertGraphViewNodeLayout({
        graphViewId: activeGraphViewId,
        documentId: node.id,
        x: node.position.x,
        y: node.position.y,
        pinned: existingLayout?.pinned ?? false,
        hidden: false,
      })
      return
    }

    if (!activeLibraryId) return

    setWorkingLayoutPositions((currentLayouts) => {
      const nextLayouts = {
        ...currentLayouts,
        [node.id]: { x: node.position.x, y: node.position.y },
      }
      const storedLayouts = readWorkingMapLayouts()
      writeWorkingMapLayouts({
        ...storedLayouts,
        [activeLibraryId]: {
          ...(storedLayouts[activeLibraryId] ?? {}),
          ...nextLayouts,
        },
      })
      return nextLayouts
    })
  }

  const handleAddDocumentToMap = async (documentId: string) => {
    if (!documentId || documentId === '__none__') return
    await revealDocumentOnMap(documentId, { select: true })

    if (pendingConnectionDocumentId && pendingConnectionDirection && pendingConnectionDocumentId !== documentId) {
      const sourceDocumentId =
        pendingConnectionDirection === 'outbound' ? pendingConnectionDocumentId : documentId
      const targetDocumentId =
        pendingConnectionDirection === 'outbound' ? documentId : pendingConnectionDocumentId
      const targetDocument = libraryDocuments.find((document) => document.id === targetDocumentId)
      if (targetDocument?.documentType === 'my_work') {
        clearPendingConnection()
        return
      }

      const created = await createRelation({
        sourceDocumentId,
        targetDocumentId,
        linkType: 'citation',
        linkOrigin: 'user',
      })

      if (created) {
        setSelectedDocumentId(null)
        setSelectedRelationId(created.id)
      }
      clearPendingConnection()
    }
  }

  const handleOpenSaveViewDialog = () => {
    setGraphViewDraft({
      name: activeGraphView?.name ?? '',
      description: activeGraphView?.description ?? '',
    })
    setIsSaveViewDialogOpen(true)
  }

  const handleOpenCreateMapDialog = () => {
    setGraphViewDraft({
      name: '',
      description: '',
    })
    setIsCreateMapDialogOpen(true)
  }

  const handleOpenEditViewDialog = () => {
    if (!activeGraphView) return
    setGraphViewDraft({
      name: activeGraphView.name,
      description: activeGraphView.description ?? '',
    })
    setIsEditingViewDialogOpen(true)
  }

  const currentViewDocumentIds = useMemo(
    () => Array.from(new Set(visibleDocuments.map((document) => document.id))),
    [visibleDocuments],
  )

  const getFallbackDocumentPosition = (documentId: string) => {
    const anchorId =
      selectedDocumentId
      ?? pendingConnectionDocumentId
      ?? currentViewDocumentIds.find((id) => id !== documentId)
      ?? null
    const anchorNode = anchorId ? reactFlow.getNode(anchorId) : null
    const anchorPosition = sanitizeGraphPosition(anchorNode?.position, { x: 720, y: 420 }) ?? { x: 720, y: 420 }
    const placementIndex = currentViewDocumentIds.length + Object.keys(pendingDocumentPlacements).length
    const angle = (placementIndex % 8) * (Math.PI / 4)
    const radius = 320 + Math.floor(placementIndex / 8) * 56

    return {
      x: anchorPosition.x + Math.cos(angle) * radius,
      y: anchorPosition.y + Math.sin(angle) * radius,
    }
  }

  const revealDocumentOnMap = async (documentId: string, options?: { select?: boolean }) => {
    recentlyRevealedDocumentIdRef.current = documentId
    const nextDocumentIds = Array.from(new Set([...(activeGraphView?.documentIds ?? manualVisibleDocumentIds), documentId]))
    const nextSelectedDocumentId = options?.select
      ? documentId
      : activeGraphView?.selectedDocumentId
    const hasGraphViewDocumentChanges = activeGraphView
      ? !areStringArraysEqual(activeGraphView.documentIds, nextDocumentIds)
      : false
    const hasGraphViewSelectionChanges = activeGraphView
      ? (activeGraphView.selectedDocumentId ?? null) !== (nextSelectedDocumentId ?? null)
      : false
    setManualVisibleDocumentIds(nextDocumentIds)
    setHiddenDocumentIds((currentIds) => currentIds.filter((id) => id !== documentId))

    if (options?.select) {
      setSelectedRelationId(null)
      setSelectedDocumentId(documentId)
      setActiveDocument(documentId)
    }

    if (activeGraphView && (hasGraphViewDocumentChanges || hasGraphViewSelectionChanges)) {
      useGraphStore.setState((state) => ({
        graphViews: state.graphViews.map((view) => (
          view.id === activeGraphView.id
            ? { ...view, documentIds: nextDocumentIds, selectedDocumentId: nextSelectedDocumentId }
            : view
        )),
        graphViewLayouts: state.graphViewLayouts.map((layout) => (
          layout.graphViewId === activeGraphView.id && layout.documentId === documentId
            ? { ...layout, hidden: false }
            : layout
        )),
      }))
      await updateGraphView(activeGraphView.id, {
        documentIds: nextDocumentIds,
        selectedDocumentId: nextSelectedDocumentId,
      })
    }

    const existingNode = reactFlow.getNode(documentId)
    if (existingNode) {
      centerOnDocument(documentId)
      if (activeGraphView) {
        await upsertGraphViewNodeLayout({
          graphViewId: activeGraphView.id,
          documentId,
          x: existingNode.position.x,
          y: existingNode.position.y,
          hidden: false,
        })
      }
      return
    }

    const fallbackPosition = getFallbackDocumentPosition(documentId)

    if (activeGraphView) {
      const nextLayout: GraphViewNodeLayout = {
        graphViewId: activeGraphView.id,
        documentId,
        x: fallbackPosition.x,
        y: fallbackPosition.y,
        pinned: graphViewLayoutMap.get(documentId)?.pinned ?? false,
        hidden: false,
        updatedAt: new Date(),
      }

      useGraphStore.setState((state) => ({
        graphViewLayouts: [
          ...state.graphViewLayouts.filter(
            (layout) => !(layout.graphViewId === activeGraphView.id && layout.documentId === documentId),
          ),
          nextLayout,
        ],
      }))
    } else if (activeLibraryId) {
      setWorkingLayoutPositions((currentLayouts) => {
        if (currentLayouts[documentId]) return currentLayouts

        const nextLayouts = {
          ...currentLayouts,
          [documentId]: fallbackPosition,
        }
        const storedLayouts = readWorkingMapLayouts()
        writeWorkingMapLayouts({
          ...storedLayouts,
          [activeLibraryId]: {
            ...(storedLayouts[activeLibraryId] ?? {}),
            ...nextLayouts,
          },
        })
        return nextLayouts
      })
    }

    setPendingDocumentPlacements((currentPlacements) => ({
      ...currentPlacements,
      [documentId]: currentPlacements[documentId] ?? fallbackPosition,
    }))

    reactFlow.setCenter(fallbackPosition.x + 110, fallbackPosition.y + 110, {
      duration: 280,
      zoom: Math.max(reactFlow.getZoom(), 1),
    })
  }

  const handleAddLinkedDocumentToMap = async (documentId: string) => {
    if (!documentId || documentId === '__none__') return
    await revealDocumentOnMap(documentId, { select: false })
  }

  const persistCurrentNodeLayoutsToGraphView = async (graphViewId: string) => {
    const documentNodes = nodes.filter((node) => node.type === 'document')
    await Promise.all(
      documentNodes.map((node) =>
        upsertGraphViewNodeLayout({
          graphViewId,
          documentId: node.id,
          x: node.position.x,
          y: node.position.y,
          pinned: graphViewLayoutMap.get(node.id)?.pinned ?? false,
          hidden: false,
        })),
    )
  }

  const persistActiveViewSnapshot = async (nextGraphView?: GraphView | null) => {
    const targetView = nextGraphView ?? activeGraphView
    if (!targetView) return

    await updateGraphView(targetView.id, {
      relationFilter: 'all',
      colorMode: graphPreferences.colorMode,
      sizeMode: graphPreferences.sizeMode,
      scopeMode: 'mapped',
      neighborhoodDepth: graphPreferences.neighborhoodDepth,
      focusMode: graphPreferences.neighborhoodDepth !== 'full',
      hideOrphans: graphPreferences.hideOrphans,
      confidenceThreshold: 0,
      yearMin: graphPreferences.yearMin,
      yearMax: graphPreferences.yearMax,
      selectedDocumentId: selectedDocumentId ?? undefined,
      documentIds: currentViewDocumentIds,
    })
  }

  const handleSaveCurrentView = async () => {
    if (!activeLibrary) return

    if (activeGraphView && !isSaveViewDialogOpen) {
      await persistActiveViewSnapshot(activeGraphView)
      setIsEditingViewDialogOpen(false)
      return
    }

    const created = await createGraphView({
      libraryId: activeLibrary.id,
      name: graphViewDraft.name.trim() || 'Untitled workspace',
      description: graphViewDraft.description.trim() || undefined,
      relationFilter: 'all',
      colorMode: graphPreferences.colorMode,
      sizeMode: graphPreferences.sizeMode,
      scopeMode: 'mapped',
      neighborhoodDepth: graphPreferences.neighborhoodDepth,
      focusMode: graphPreferences.neighborhoodDepth !== 'full',
      hideOrphans: graphPreferences.hideOrphans,
      confidenceThreshold: 0,
      yearMin: graphPreferences.yearMin,
      yearMax: graphPreferences.yearMax,
      selectedDocumentId: selectedDocumentId ?? undefined,
      documentIds: currentViewDocumentIds,
    })

    if (!created) return
    await persistCurrentNodeLayoutsToGraphView(created.id)
    setActiveGraphViewId(created.id)
    setIsSaveViewDialogOpen(false)
    setGraphViewDraft(DEFAULT_GRAPH_VIEW_DRAFT)
  }

  const handleCreateNewMap = async () => {
    if (!activeLibrary) return

    const created = await createGraphView({
      libraryId: activeLibrary.id,
      name: graphViewDraft.name.trim() || `Map ${activeLibraryGraphViews.length + 1}`,
      description: graphViewDraft.description.trim() || undefined,
      relationFilter: 'all',
      colorMode: graphPreferences.colorMode,
      sizeMode: graphPreferences.sizeMode,
      scopeMode: 'mapped',
      neighborhoodDepth: graphPreferences.neighborhoodDepth,
      focusMode: graphPreferences.neighborhoodDepth !== 'full',
      hideOrphans: graphPreferences.hideOrphans,
      confidenceThreshold: 0,
      yearMin: graphPreferences.yearMin,
      yearMax: graphPreferences.yearMax,
      selectedDocumentId: undefined,
      documentIds: [],
    })

    if (!created) return

    setManualVisibleDocumentIds([])
    setHiddenDocumentIds([])
    setSelectedDocumentId(null)
    setSelectedWorkReferenceId(null)
    setSelectedRelationId(null)
    setPendingDocumentPlacements({})
    setWorkingLayoutPositions({})
    setActiveGraphViewId(created.id)
    setIsCreateMapDialogOpen(false)
    setGraphViewDraft(DEFAULT_GRAPH_VIEW_DRAFT)
  }

  const handleUpdateGraphViewMeta = async () => {
    if (!activeGraphView) return
    const updated = await updateGraphView(activeGraphView.id, {
      name: graphViewDraft.name.trim() || activeGraphView.name,
      description: graphViewDraft.description.trim() || undefined,
      relationFilter: 'all',
      colorMode: graphPreferences.colorMode,
      sizeMode: graphPreferences.sizeMode,
      scopeMode: 'mapped',
      neighborhoodDepth: graphPreferences.neighborhoodDepth,
      focusMode: graphPreferences.neighborhoodDepth !== 'full',
      hideOrphans: graphPreferences.hideOrphans,
      confidenceThreshold: 0,
      yearMin: graphPreferences.yearMin,
      yearMax: graphPreferences.yearMax,
      selectedDocumentId: selectedDocumentId ?? undefined,
      documentIds: currentViewDocumentIds,
    })
    if (!updated) return
    setIsEditingViewDialogOpen(false)
  }

  const handleDuplicateGraphView = async () => {
    if (!activeGraphView) return
    const duplicated = await duplicateGraphView(activeGraphView.id)
    if (!duplicated) return
    setActiveGraphViewId(duplicated.id)
  }

  const handleDeleteActiveGraphView = async () => {
    if (!activeGraphView) return
    const fallbackGraphViewId = activeLibraryGraphViews.find((view) => view.id !== activeGraphView.id)?.id ?? null
    const deleted = await deleteGraphView(activeGraphView.id)
    if (!deleted) return
    setActiveGraphViewId(fallbackGraphViewId)
    setIsDeleteWorkspaceDialogOpen(false)
  }

  const centerOnDocument = (documentId: string) => {
    const node = reactFlow.getNode(documentId)
    if (!node) return
    const safePosition = sanitizeGraphPosition(node.position)
    if (!safePosition) return
    const width = typeof node.width === 'number' ? node.width : 220
    const height = typeof node.height === 'number' ? node.height : 220
    reactFlow.setCenter(safePosition.x + width / 2, safePosition.y + height / 2, {
      duration: 400,
      zoom: Math.max(reactFlow.getZoom(), 1),
    })
  }

  useEffect(() => {
    const recentlyRevealedDocumentId = recentlyRevealedDocumentIdRef.current
    if (!recentlyRevealedDocumentId) return
    if (!visibleDocuments.some((document) => document.id === recentlyRevealedDocumentId)) return
    if (nodes.some((node) => node.type === 'document' && node.id === recentlyRevealedDocumentId)) return

    const timer = window.setTimeout(() => {
      if (reactFlow.getNode(recentlyRevealedDocumentId)) return

      const fallbackNodes = buildDocumentGraphNodes(visibleDocuments, visibleRelations).map((node) => {
        const savedLayout = effectiveLayoutMap.get(node.id)

        return {
          ...node,
          draggable: !savedLayout?.pinned,
          position: savedLayout ? { x: savedLayout.x, y: savedLayout.y } : node.position,
          data: {
            ...node.data,
            pendingConnectionDirection:
              node.id === pendingConnectionDocumentId ? pendingConnectionDirection : null,
            onStartConnection: handleStartConnection,
          },
        }
      })

      setNodes(fallbackNodes)
      setEdges(buildDocumentGraphEdges(visibleRelations, selectedDocumentId, selectedRelationId, hoveredRelationId))

      window.requestAnimationFrame(() => {
        reactFlow.fitView({ padding: 0.2, duration: 250 })
      })
    }, 160)

    return () => window.clearTimeout(timer)
  }, [
    effectiveLayoutMap,
    hoveredRelationId,
    nodes,
    pendingConnectionDirection,
    pendingConnectionDocumentId,
    reactFlow,
    selectedDocumentId,
    selectedRelationId,
    setEdges,
    setNodes,
    visibleDocuments,
    visibleRelations,
  ])

  const handlePinDocument = async (documentId: string, pinned: boolean) => {
    if (!activeGraphViewId) return
    const node = reactFlow.getNode(documentId)
    if (!node) return
    await upsertGraphViewNodeLayout({
      graphViewId: activeGraphViewId,
      documentId,
      x: node.position.x,
      y: node.position.y,
      pinned,
      hidden: false,
    })
  }

  const handleResetDocumentPosition = async (documentId: string) => {
    if (!activeGraphViewId) return
    await resetGraphViewNodeLayouts(activeGraphViewId, documentId)
    handleReheatLayout()
  }

  const handleResetCurrentViewPositions = async () => {
    if (!activeGraphViewId) return
    await resetGraphViewNodeLayouts(activeGraphViewId)
    handleReheatLayout()
  }

  const handleRemoveDocumentFromCurrentView = async (documentId: string) => {
    setHiddenDocumentIds((currentIds) => Array.from(new Set([...currentIds, documentId])))
    if (!activeGraphView) return
    await upsertGraphViewNodeLayout({
      graphViewId: activeGraphView.id,
      documentId,
      x: reactFlow.getNode(documentId)?.position.x ?? 0,
      y: reactFlow.getNode(documentId)?.position.y ?? 0,
      hidden: true,
      pinned: graphViewLayoutMap.get(documentId)?.pinned ?? false,
    })
    if (selectedDocumentId === documentId) {
      setSelectedDocumentId(null)
    }
  }

  const handleJumpToDocument = (documentId: string) => {
    setManualVisibleDocumentIds((currentIds) => Array.from(new Set([...currentIds, documentId])))
    setSelectedRelationId(null)
    setSelectedDocumentId(documentId)
    setActiveDocument(documentId)
    startTransition(() => {
      window.setTimeout(() => centerOnDocument(documentId), 60)
    })
  }

  const handleShowNeighborsOnly = (documentId: string) => {
    setSelectedRelationId(null)
    setSelectedDocumentId(documentId)
    setGraphPreferences((current) => ({
      ...current,
      focusMode: true,
      neighborhoodDepth: '1',
    }))
    startTransition(() => {
      window.setTimeout(() => centerOnDocument(documentId), 60)
    })
  }

  const handleReheatLayout = async () => {
    if (nodes.length === 0) return

    setIsReheatingLayout(true)
    const nodeDimensions = new Map(
      nodes.map((node) => [
        node.id,
        {
          width: typeof node.width === 'number' ? node.width : typeof node.style?.width === 'number' ? node.style.width : 220,
          height: typeof node.height === 'number' ? node.height : typeof node.style?.height === 'number' ? node.style.height : 220,
        },
      ]),
    )
    const currentPositions = new Map(nodes.map((node) => [node.id, node.position]))
    const nextPositions = runReheatLayout({
      nodeIds: nodes.map((node) => node.id),
      relations: edges.map((edge) => ({
        sourceDocumentId: edge.source,
        targetDocumentId: edge.target,
      })),
      currentPositions,
    })

    const freeformReferenceTargetsByWork = new Map<string, string[]>()
    for (const edge of edges) {
      if (!edge.id.startsWith('work-reference-edge-')) continue
      if (!edge.target.startsWith('work-reference-node-')) continue
      const targets = freeformReferenceTargetsByWork.get(edge.source) ?? []
      targets.push(edge.target)
      freeformReferenceTargetsByWork.set(edge.source, targets)
    }

    for (const [workId, referenceNodeIds] of freeformReferenceTargetsByWork.entries()) {
      const workPosition = nextPositions.get(workId)
      if (!workPosition || referenceNodeIds.length === 0) continue

      const baseRadius = Math.max(360, 280 + referenceNodeIds.length * 16)
      const startAngle = -Math.PI / 2
      const angleStep = (Math.PI * 1.4) / Math.max(1, referenceNodeIds.length - 1 || 1)

      referenceNodeIds.forEach((referenceNodeId, index) => {
        const baseAngle = referenceNodeIds.length === 1
          ? startAngle
          : startAngle - 0.7 * Math.PI + angleStep * index

        const referenceSize = nodeDimensions.get(referenceNodeId) ?? { width: 220, height: 220 }
        let placedPosition = {
          x: workPosition.x + Math.cos(baseAngle) * baseRadius,
          y: workPosition.y + Math.sin(baseAngle) * baseRadius,
        }

        for (let attempt = 0; attempt < 18; attempt += 1) {
          const radius = baseRadius + attempt * 64
          const angle = baseAngle + (attempt % 2 === 0 ? 1 : -1) * Math.floor(attempt / 2) * 0.22
          const candidate = {
            x: workPosition.x + Math.cos(angle) * radius,
            y: workPosition.y + Math.sin(angle) * radius,
          }

          const overlapsExistingNode = Array.from(nextPositions.entries()).some(([otherNodeId, otherPosition]) => {
            if (otherNodeId === referenceNodeId) return false
            const otherSize = nodeDimensions.get(otherNodeId) ?? { width: 220, height: 220 }
            const dx = candidate.x - otherPosition.x
            const dy = candidate.y - otherPosition.y
            const minDistanceX = (referenceSize.width + otherSize.width) * 0.5 + 36
            const minDistanceY = (referenceSize.height + otherSize.height) * 0.5 + 36
            return Math.abs(dx) < minDistanceX && Math.abs(dy) < minDistanceY
          })

          if (!overlapsExistingNode) {
            placedPosition = candidate
            break
          }
        }

        nextPositions.set(referenceNodeId, placedPosition)
      })
    }

    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        position: nextPositions.get(node.id) ?? node.position,
      })),
    )

    if (activeGraphViewId) {
      const currentPinnedById = new Map(
        Array.from(graphViewLayoutMap.values()).map((layout) => [layout.documentId, layout.pinned]),
      )

      await Promise.all(
        nodes
          .filter((node) => node.type === 'document')
          .map((node) => {
            const nextPosition = nextPositions.get(node.id) ?? node.position
            return upsertGraphViewNodeLayout({
              graphViewId: activeGraphViewId,
              documentId: node.id,
              x: nextPosition.x,
              y: nextPosition.y,
              pinned: currentPinnedById.get(node.id) ?? false,
              hidden: false,
            })
          }),
      )
    }

    if (activeLibraryId) {
      const nextWorkingLayouts = Object.fromEntries(
        Array.from(nextPositions.entries()).map(([nodeId, position]) => [nodeId, position]),
      )
      setWorkingLayoutPositions((currentLayouts) => ({
        ...currentLayouts,
        ...nextWorkingLayouts,
      }))
      const storedLayouts = readWorkingMapLayouts()
      writeWorkingMapLayouts({
        ...storedLayouts,
        [activeLibraryId]: {
          ...(storedLayouts[activeLibraryId] ?? {}),
          ...nextWorkingLayouts,
        },
      })
    }

    window.setTimeout(() => setIsReheatingLayout(false), 250)
  }

  if (libraryDocuments.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={GitBranch}
          title="Knowledge maps are empty"
          description="Import documents into the current library to start building a relationship graph."
          action={(
            <Button asChild>
              <Link href="/libraries">Open Libraries</Link>
            </Button>
          )}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(13,148,136,0.06),_transparent_24%),linear-gradient(180deg,_rgba(248,250,252,1)_0%,_rgba(244,246,248,1)_100%)]">
      <div className="shrink-0 border-b border-border/80 bg-background/92 px-6 py-3 backdrop-blur">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Waypoints className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">{t('mapsPage.title')}</h1>
                <p className="text-sm text-muted-foreground xl:whitespace-nowrap">
                  {t('mapsPage.subtitle')}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsTopBarCollapsed((current) => !current)}
                >
                  {isTopBarCollapsed ? (
                    <>
                      <ChevronDown className="mr-2 h-4 w-4" />
                      {t('mapsPage.showControls')}
                    </>
                  ) : (
                    <>
                      <ChevronUp className="mr-2 h-4 w-4" />
                      {t('mapsPage.hideControls')}
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenCreateMapDialog}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t('mapsPage.newMap')}
                </Button>
                {activeGraphView ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="outline" onClick={() => void persistActiveViewSnapshot()}>
                        <Save className="mr-2 h-4 w-4" />
                        {t('mapsPage.saveCurrentView')}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={8}>
                      {t('mapsPage.saveCurrentViewHelp')}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" onClick={handleOpenSaveViewDialog}>
                      <Save className="mr-2 h-4 w-4" />
                      {activeGraphView ? t('mapsPage.saveAsNewView') : t('mapsPage.saveView')}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={8}>
                    {t('mapsPage.saveNewViewHelp')}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleReheatLayout()}
                      disabled={isReheatingLayout || visibleDocuments.length === 0}
                    >
                      <WandSparkles className={cn('mr-2 h-4 w-4', isReheatingLayout && 'animate-pulse')} />
                      {t('mapsPage.rebuildLayout')}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={8}>
                    {t('mapsPage.rebuildLayoutHelp')}
                  </TooltipContent>
                </Tooltip>
              </div>
              {activeGraphView ? (
                <Button size="sm" variant="outline" onClick={() => setIsDeleteWorkspaceDialogOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('mapsPage.deleteMap')}
                </Button>
              ) : null}
            </div>
          </div>

          {!isTopBarCollapsed ? (
          <div className="grid gap-2 xl:grid-cols-[minmax(0,0.72fr)_minmax(360px,520px)_minmax(0,0.95fr)]">
            <Card
              className="border-border/70 bg-card/92 p-3 shadow-[0_10px_28px_rgba(15,23,42,0.05)]"
              data-tour-id="maps-workspace"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {t('mapsPage.workspace')}
                    </p>
                    <Badge variant="outline" className="h-5 rounded-full px-2 text-[10px]">
                      {visibleDocuments.length}
                    </Badge>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="min-w-[220px] flex-1">
                        <Select
                          value={activeGraphViewId ?? WORKING_MAP_SELECT_VALUE}
                          onValueChange={(value) => setActiveGraphViewId(value === WORKING_MAP_SELECT_VALUE ? null : value)}
                        >
                          <SelectTrigger className="bg-background/90">
                            <SelectValue placeholder={t('mapsPage.workingMap')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={WORKING_MAP_SELECT_VALUE}>
                              {t('mapsPage.workingMap')}
                            </SelectItem>
                            {activeLibraryGraphViews.map((view) => (
                              <SelectItem key={view.id} value={view.id}>
                                {view.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={8}>
                      {activeGraphView?.description?.trim() || t('mapsPage.workingMapDescription')}
                    </TooltipContent>
                  </Tooltip>
                </div>
                {activeGraphView ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={handleOpenEditViewDialog}>
                      {t('mapsPage.renameView')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void handleDuplicateGraphView()}>
                      <Plus className="mr-2 h-4 w-4" />
                      {t('mapsPage.duplicateView')}
                    </Button>
                  </div>
                ) : null}
              </div>
            </Card>

            <Card
              className="border-border/70 bg-card/92 p-3 shadow-[0_10px_28px_rgba(15,23,42,0.05)]"
              data-tour-id="maps-add-controls"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {t('mapsPage.canvasEditor')}
                  </p>
                </div>
                <div className="flex min-w-0 flex-wrap gap-2 sm:flex-nowrap">
                  <Popover open={isAddDocumentPopoverOpen} onOpenChange={setIsAddDocumentPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={isAddDocumentPopoverOpen}
                        className="min-w-0 flex-1 justify-between bg-white/90 text-left whitespace-normal h-auto py-2"
                      >
                        <span className="min-w-0 flex-1 break-words pr-2">
                          {pendingConnectionDirection
                            ? pendingConnectionDirection === 'outbound'
                              ? t('mapsPage.findReferencedDocument')
                              : t('mapsPage.findCitingDocument')
                            : t('mapsPage.addDocumentToMap')}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[320px] p-0" align="start">
                      <div className="space-y-2 p-2">
                        <Input
                          value={addDocumentQuery}
                          onChange={(event) => setAddDocumentQuery(event.target.value)}
                          placeholder={pendingConnectionDirection ? t('mapsPage.searchAndLinkPlaceholder') : t('mapsPage.searchDocumentsPlaceholder')}
                          className="bg-background"
                        />
                        <div className="max-h-[300px] overflow-y-auto">
                          {filteredAddableDocuments.length > 0 ? (
                            <div className="space-y-1">
                              {filteredAddableDocuments.map((document) => (
                                <button
                                  key={document.id}
                                  type="button"
                                  className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition hover:bg-accent hover:text-accent-foreground"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    void handleAddDocumentToMap(document.id)
                                    setIsAddDocumentPopoverOpen(false)
                                    setAddDocumentQuery('')
                                  }}
                                >
                                  <Check className="mt-0.5 h-4 w-4 shrink-0 opacity-0" />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm">{document.title}</p>
                                    <p className="truncate text-xs text-slate-500">
                                      {document.authors.slice(0, 2).join(', ') || t('searchPage.unknownAuthor')}
                                      {document.year ? ` - ${document.year}` : ''}
                                    </p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                              {t('mapsPage.noMatchingDocument')}
                            </p>
                          )}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  {myWorkDocuments.length > 0 ? (
                    <Select
                      key={selectedMyWorkPickerResetKey}
                      onValueChange={(value) => {
                        void handleAddDocumentToMap(value)
                        setSelectedMyWorkPickerResetKey((currentKey) => currentKey + 1)
                      }}
                    >
                      <SelectTrigger className="w-[220px] shrink-0 bg-background/90">
                        <SelectValue placeholder={t('mapsPage.selectWork')} />
                      </SelectTrigger>
                      <SelectContent>
                        {myWorkDocuments.map((document) => (
                          <SelectItem key={document.id} value={document.id}>
                            {document.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="min-w-0 flex-1 text-xs text-muted-foreground whitespace-normal break-words">
                      {t('mapsPage.noWorksRegisteredPrefix')}{' '}
                      <Link href="/references" className="font-medium text-foreground underline underline-offset-4">
                        {t('referencesPage.title')}
                      </Link>{' '}
                      {t('mapsPage.noWorksRegisteredSuffix')}
                    </p>
                  )}
                </div>
              </div>
            </Card>

            <DocumentGraphControls
              colorMode={graphPreferences.colorMode}
              onColorModeChange={(value) => setGraphPreferences((current) => ({ ...current, colorMode: value }))}
              sizeMode={graphPreferences.sizeMode}
              onSizeModeChange={(value) => setGraphPreferences((current) => ({ ...current, sizeMode: value }))}
              neighborhoodDepth={graphPreferences.neighborhoodDepth}
              onNeighborhoodDepthChange={(value) => setGraphPreferences((current) => ({
                ...current,
                neighborhoodDepth: value,
                focusMode: value !== 'full',
              }))}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              searchResults={searchResults}
              onJumpToDocument={handleJumpToDocument}
            />
          </div>
          ) : null}
        </div>
      </div>

      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        onMouseMove={(event) => {
          if (!pendingConnectionDirection) return
          const bounds = event.currentTarget.getBoundingClientRect()
          setPendingConnectionCursor({
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
          })
        }}
        onMouseLeave={() => {
          if (!pendingConnectionDirection) return
          setPendingConnectionCursor(null)
        }}
      >
        <div className="relative h-full min-h-0 overflow-hidden bg-muted/55 dark:bg-[#141821]">
          {visibleDocuments.length === 0 ? (
            <div className="pointer-events-none absolute left-6 top-6 z-10 max-w-sm">
              <Card className="border-dashed bg-card/92 p-4 shadow-sm">
                <p className="text-sm text-muted-foreground">
                  {t('mapsPage.noDocumentsControls')}
                </p>
              </Card>
            </div>
          ) : edges.length === 0 ? (
            <div className="pointer-events-none absolute left-6 top-6 z-10 max-w-sm">
              <Card className="border-dashed bg-card/92 p-4 shadow-sm">
                <p className="text-sm text-muted-foreground">
                  {t('mapsPage.noLinksControls')}
                </p>
              </Card>
            </div>
          ) : null}

          {pendingConnectionDirection && pendingConnectionCursor ? (
            <div
              className={cn(
                'pointer-events-none absolute z-20 w-[250px] -translate-x-1/2 -translate-y-full rounded-full border px-3 py-2 text-center text-xs font-medium shadow-sm',
                pendingConnectionDirection === 'outbound'
                  ? 'border-sky-300 bg-sky-50/95 text-sky-800'
                  : 'border-rose-300 bg-rose-50/95 text-rose-800',
              )}
              style={{
                left: Math.max(pendingConnectionCursor.x, 140),
                top: Math.max(pendingConnectionCursor.y - 16, 24),
              }}
            >
              {pendingConnectionDirection === 'outbound'
                ? t('mapsPage.selectReferenceTarget')
                : t('mapsPage.selectCitationTarget')}
            </div>
          ) : null}

          <div data-tour-id="maps-canvas" className="h-full min-h-0 w-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onNodeDragStart={handleNodeDragStart}
            onNodeDragStop={(event, node, nodesForDrag) => void handleNodeDragStop(event, node, nodesForDrag)}
            onEdgesChange={handleEdgesChange}
            onConnectStart={handleConnectStart}
            onConnect={(connection) => void handleConnect(connection)}
            onConnectEnd={(event) => void handleConnectEnd(event)}
            onNodeClick={async (_, node) => {
              if (node.type === 'reference') {
                clearPendingConnection()
                setSelectedDocumentId(null)
                setSelectedRelationId(null)
                setSelectedWorkReferenceId(node.id.replace('work-reference-node-', ''))
                setContextMenu(null)
                setActiveDocument(null)
                return
              }
              if (pendingConnectionDocumentId && pendingConnectionDocumentId !== node.id) {
                await handleClickToConnect(node.id)
                return
              }
              setSelectedDocumentId(node.id)
              setSelectedWorkReferenceId(null)
              setSelectedRelationId(null)
              setActiveDocument(node.id)
            }}
            onNodeContextMenu={(event, node) => {
              if (node.type === 'reference') {
                event.preventDefault()
                clearPendingConnection()
                setSelectedDocumentId(null)
                setSelectedRelationId(null)
                setSelectedWorkReferenceId(node.id.replace('work-reference-node-', ''))
                setContextMenu(null)
                setActiveDocument(null)
                return
              }
              if (node.type !== 'document') return
              event.preventDefault()
              setSelectedDocumentId(node.id)
              setSelectedWorkReferenceId(null)
              setSelectedRelationId(null)
              setContextMenu({
                kind: 'node',
                documentId: node.id,
                x: event.clientX,
                y: event.clientY,
              })
              setActiveDocument(node.id)
            }}
            onNodeMouseEnter={(_, node) => {
              if (node.type === 'reference') {
                setHoveredWorkReferenceId(node.id.replace('work-reference-node-', ''))
                return
              }
              if (node.type !== 'document') return
              setHoveredDocumentId(node.id)
            }}
            onNodeMouseLeave={(_, node) => {
              if (node.type === 'reference') {
                setHoveredWorkReferenceId(null)
                return
              }
              if (node.type !== 'document') return
              setHoveredDocumentId(null)
            }}
            onEdgeClick={(_, edge) => {
              if (edge.id.startsWith('work-reference-edge-')) {
                setSelectedDocumentId(null)
                setSelectedRelationId(null)
                setSelectedWorkReferenceId(edge.id.replace('work-reference-edge-', ''))
                clearPendingConnection()
                setActiveDocument(null)
                return
              }
              setSelectedDocumentId(null)
              setSelectedWorkReferenceId(null)
              clearPendingConnection()
              setSelectedRelationId(edge.id)
              setActiveDocument(null)
            }}
            onEdgeContextMenu={(event, edge) => {
              if (edge.id.startsWith('work-reference-edge-')) {
                event.preventDefault()
                setSelectedDocumentId(null)
                setSelectedRelationId(null)
                setSelectedWorkReferenceId(edge.id.replace('work-reference-edge-', ''))
                clearPendingConnection()
                setActiveDocument(null)
                return
              }
              event.preventDefault()
              setSelectedDocumentId(null)
              setSelectedWorkReferenceId(null)
              clearPendingConnection()
              setSelectedRelationId(edge.id)
              setActiveDocument(null)
              setContextMenu({
                kind: 'edge',
                relationId: edge.id,
                x: event.clientX,
                y: event.clientY,
              })
            }}
            onEdgeMouseEnter={(_, edge) => setHoveredRelationId(edge.id)}
            onEdgeMouseLeave={() => setHoveredRelationId(null)}
            onPaneClick={() => {
              clearSelection()
              clearPendingConnection()
            }}
            nodeTypes={FLOW_NODE_TYPES}
            edgeTypes={FLOW_EDGE_TYPES}
            connectionRadius={72}
            className="h-full bg-transparent"
            proOptions={{ hideAttribution: true }}
          >
            <MiniMap
              pannable
              zoomable
              nodeStrokeColor={(node) => node.data?.borderColor ?? '#cbd5e1'}
              nodeColor={(node) => node.data?.fillColor ?? '#ffffff'}
              maskColor={isDarkMode ? 'rgba(20,24,33,0.78)' : 'rgba(241,245,249,0.72)'}
            />
            <Controls />
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color={isDarkMode ? '#334155' : '#cbd5e1'}
            />
          </ReactFlow>
          </div>
          {contextMenu ? (
            <div
              className="fixed z-[1000] min-w-[180px] rounded-md border bg-white p-1 shadow-lg"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              {contextMenu.kind === 'node' ? (
                <>
                  <button
                    type="button"
                    className="w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-slate-100"
                    onClick={() => {
                      void handleRemoveDocumentFromCurrentView(contextMenu.documentId)
                      setContextMenu(null)
                    }}
                  >
                    {t('mapsPage.deleteNode')}
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-slate-100"
                    onClick={() => {
                      setPendingDeleteAllLinksDocumentId(contextMenu.documentId)
                      setContextMenu(null)
                    }}
                  >
                    {t('mapsPage.deleteAllLinks')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-slate-100"
                    onClick={() => {
                      void handleDeleteRelationWithoutPrompt(contextMenu.relationId)
                      setContextMenu(null)
                    }}
                  >
                    {t('mapsPage.removeLinkMenu')}
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-slate-100"
                    onClick={() => {
                      void handleInvertRelation(contextMenu.relationId)
                      setContextMenu(null)
                    }}
                  >
                    {t('mapsPage.invertLinkMenu')}
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>

        {isSelectionPanelOpen ? (
          <div className="pointer-events-none absolute inset-y-4 right-4 z-30 flex w-full max-w-[540px] justify-end">
            <aside className="pointer-events-auto h-full w-full overflow-hidden rounded-[28px] border border-border/80 bg-background/96 shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur">
              <DocumentGraphPanel
                selectedDocument={selectedDocument}
                selectedWorkReference={selectedWorkReference}
                selectedRelation={selectedRelation}
                sourceDocument={sourceDocument}
                targetDocument={targetDocument}
                relatedIncomingDocuments={selectedDocumentVisibleIncomingDocuments}
                relatedOutgoingDocuments={selectedDocumentVisibleOutgoingDocuments}
                otherIncomingDocuments={selectedDocumentOtherIncomingDocuments}
                otherOutgoingDocuments={selectedDocumentOtherOutgoingDocuments}
                onDeleteRelation={handleDeleteRelation}
                onInvertRelation={handleInvertRelation}
                onAddLinkedDocumentToMap={handleAddLinkedDocumentToMap}
                onHideLinkedDocumentFromMap={handleRemoveDocumentFromCurrentView}
                isDeletingRelation={isDeletingRelation}
                onCloseSelection={clearSelection}
              />
            </aside>
          </div>
        ) : null}
      </div>

      <Dialog
        open={isCreateMapDialogOpen}
        onOpenChange={(open) => {
          setIsCreateMapDialogOpen(open)
          if (!open) {
            setGraphViewDraft(DEFAULT_GRAPH_VIEW_DRAFT)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('mapsPage.newMap')}</DialogTitle>
            <DialogDescription>
              Create a named map from the current view without clearing the existing one.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="create-graph-view-name">{t('mapsPage.name')}</Label>
              <Input
                id="create-graph-view-name"
                value={graphViewDraft.name}
                onChange={(event) => setGraphViewDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder={t('mapsPage.newMap')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-graph-view-description">{t('mapsPage.workspaceNote')}</Label>
              <Textarea
                id="create-graph-view-description"
                value={graphViewDraft.description}
                onChange={(event) => setGraphViewDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder={t('mapsPage.workspaceNotePlaceholder')}
                className="min-h-24"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateMapDialogOpen(false)}>
              {t('mapsPage.cancel')}
            </Button>
            <Button onClick={() => void handleCreateNewMap()}>
              {t('mapsPage.newMap')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSaveViewDialogOpen} onOpenChange={setIsSaveViewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('mapsPage.saveGraphView')}</DialogTitle>
            <DialogDescription>
              {t('mapsPage.saveGraphViewDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="graph-view-name">{t('mapsPage.name')}</Label>
              <Input
                id="graph-view-name"
                value={graphViewDraft.name}
                onChange={(event) => setGraphViewDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder={t('mapsPage.saveGraphView')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="graph-view-description">{t('mapsPage.workspaceNote')}</Label>
              <Textarea
                id="graph-view-description"
                value={graphViewDraft.description}
                onChange={(event) => setGraphViewDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder={t('mapsPage.workspaceNotePlaceholder')}
                className="min-h-24"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSaveViewDialogOpen(false)}>
              {t('mapsPage.cancel')}
            </Button>
            <Button onClick={() => void handleSaveCurrentView()}>
              {t('mapsPage.saveView')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditingViewDialogOpen} onOpenChange={setIsEditingViewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('mapsPage.editGraphView')}</DialogTitle>
            <DialogDescription>
              {t('mapsPage.editGraphViewDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-graph-view-name">{t('mapsPage.name')}</Label>
              <Input
                id="edit-graph-view-name"
                value={graphViewDraft.name}
                onChange={(event) => setGraphViewDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-graph-view-description">{t('mapsPage.workspaceNote')}</Label>
              <Textarea
                id="edit-graph-view-description"
                value={graphViewDraft.description}
                onChange={(event) => setGraphViewDraft((current) => ({ ...current, description: event.target.value }))}
                className="min-h-24"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditingViewDialogOpen(false)}>
              {t('mapsPage.cancel')}
            </Button>
            <Button onClick={() => void handleUpdateGraphViewMeta()}>
              {t('mapsPage.saveChanges')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingDeleteRelation)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteRelationId(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('mapsPage.breakLink')}</DialogTitle>
            <DialogDescription>
              This will remove permanently the relationship between those two documents.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteRelationId(null)}>
              {t('mapsPage.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!pendingDeleteRelationId) return
                void handleDeleteRelationWithoutPrompt(pendingDeleteRelationId)
                setPendingDeleteRelationId(null)
              }}
              disabled={isDeletingRelation}
            >
              {isDeletingRelation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t('mapsPage.breakLink')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(pendingDeleteAllLinksDocumentId)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteAllLinksDocumentId(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('mapsPage.deleteAllLinks')}</AlertDialogTitle>
            <AlertDialogDescription>
              {`Delete ${pendingDeleteAllLinksCount} link(s) connected to this node?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingRelation}>{t('mapsPage.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingRelation}
              onClick={() => {
                if (!pendingDeleteAllLinksDocumentId) return
                void handleDeleteAllLinksForDocument(pendingDeleteAllLinksDocumentId)
              }}
            >
              {isDeletingRelation ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('mapsPage.deleteAllLinks')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={isDeleteWorkspaceDialogOpen} onOpenChange={setIsDeleteWorkspaceDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('mapsPage.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {activeGraphView ? `Delete workspace "${activeGraphView.name}"?` : 'Delete this workspace?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('mapsPage.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDeleteActiveGraphView()}>
              {t('mapsPage.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function MapsPage() {
  return (
    <ReactFlowProvider>
      <MapsPageContent />
    </ReactFlowProvider>
  )
}
