'use client'

import type { Edge, Node } from 'reactflow'
import { MarkerType, Position } from 'reactflow'
import type { Document, DocumentRelation } from '@/lib/types'

export type DocumentGraphNodeData = {
  document: Document
  relationCount: number
  inboundCitationCount?: number
  outboundCitationCount?: number
  fillColor?: string
  borderColor?: string
  sizePx?: number
  isFocused?: boolean
  isHovered?: boolean
  isCurrentDocument?: boolean
  isSearchMatch?: boolean
  isSelected?: boolean
  isDimmed?: boolean
  isDropping?: boolean
  isConnectedToSelectedDocument?: boolean
  connectionDirection?: 'incoming' | 'outgoing' | null
}

const GRID_COLUMNS = 4
const NODE_X_GAP = 280
const NODE_Y_GAP = 180
const MAP_BUBBLE_SIZE = 56

function buildDeterministicPosition(index: number) {
  const column = index % GRID_COLUMNS
  const row = Math.floor(index / GRID_COLUMNS)

  return {
    x: 80 + column * NODE_X_GAP + row * 18,
    y: 80 + row * NODE_Y_GAP + (column % 2) * 22,
  }
}

export function buildDocumentGraphNodes(
  documents: Document[],
  relations: DocumentRelation[],
  appearance?: Record<string, Partial<DocumentGraphNodeData>>,
): Node<DocumentGraphNodeData>[] {
  const relationCounts = relations.reduce<Record<string, number>>((acc, relation) => {
    acc[relation.sourceDocumentId] = (acc[relation.sourceDocumentId] ?? 0) + 1
    acc[relation.targetDocumentId] = (acc[relation.targetDocumentId] ?? 0) + 1
    return acc
  }, {})

  return documents.map((document, index) => {
    const nodeAppearance = appearance?.[document.id] ?? {}

    return {
      id: document.id,
      type: 'document',
      position: buildDeterministicPosition(index),
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        document,
        relationCount: relationCounts[document.id] ?? 0,
        ...nodeAppearance,
      },
      style: {
        width: MAP_BUBBLE_SIZE,
        height: MAP_BUBBLE_SIZE,
        borderRadius: 9999,
        border: 'none',
        background: 'transparent',
        boxShadow: 'none',
        fontSize: 12,
        opacity: nodeAppearance.isDimmed ? 0.42 : 1,
      },
    }
  })
}

export function buildDocumentGraphEdges(
  relations: DocumentRelation[],
  selectedDocumentId?: string | null,
  selectedRelationId?: string | null,
  hoveredRelationId?: string | null,
): Edge[] {
  return relations.map((relation) => {
    const isAuto = relation.linkOrigin === 'auto'
    const isCitation = relation.linkType === 'citation'
    const isSemanticManual = relation.linkOrigin === 'user' && relation.linkType !== 'manual'
    const isProposed = relation.relationStatus === 'proposed'
    const isRejected = relation.relationStatus === 'rejected'
    const isConnectedToSelectedDocument = selectedDocumentId != null
      && (relation.sourceDocumentId === selectedDocumentId || relation.targetDocumentId === selectedDocumentId)
    const connectionDirection = !isConnectedToSelectedDocument
      ? null
      : relation.sourceDocumentId === selectedDocumentId
        ? 'outgoing'
        : 'incoming'
    const isSelected = relation.id === selectedRelationId
    const isHovered = relation.id === hoveredRelationId
    const baseColor = isRejected ? '#cbd5e1' : '#64748b'
    const selectedColor = '#f59e0b'
    const strokeColor = isSelected ? selectedColor : baseColor

    return {
      id: relation.id,
      source: relation.sourceDocumentId,
      target: relation.targetDocumentId,
      sourceHandle: 'center-source',
      targetHandle: 'center-target',
      type: 'relationship',
      animated: false,
      markerStart: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: strokeColor,
      },
      markerEnd: undefined,
      label: relation.linkType !== 'manual'
        ? relation.label ?? relation.linkType.replace('_', ' ')
        : relation.label,
      style: {
        stroke: strokeColor,
        strokeWidth: 2.2,
        strokeDasharray: isProposed
          ? '4 4'
          : relation.linkType === 'contradicts'
            ? '3 3'
            : undefined,
        filter: isSelected
          ? 'drop-shadow(0 0 10px rgba(245, 158, 11, 0.35))'
          : undefined,
        opacity: 1,
      },
      labelStyle: {
        fill: isSelected ? '#0f172a' : '#334155',
        fontSize: isSelected ? 12 : 11,
        fontWeight: isSelected ? 700 : 600,
      },
      labelBgStyle: {
        fill: isSelected ? 'rgba(240,253,250,0.98)' : 'rgba(255,255,255,0.9)',
        fillOpacity: 1,
      },
      labelBgPadding: isSelected ? [8, 4] : [6, 3],
      zIndex: 0,
      data: {
        ...relation,
        isHovered,
        isConnectedToSelectedDocument,
        connectionDirection,
      },
    }
  })
}

export function getDocumentOpenHref(document: Document) {
  return document.documentType === 'my_work'
    ? `/documents?id=${document.id}`
    : document.documentType === 'physical_book'
    ? `/books/notes?id=${document.id}`
    : `/reader/view?id=${document.id}`
}
