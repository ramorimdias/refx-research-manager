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
  isDimmed?: boolean
}

const GRID_COLUMNS = 4
const NODE_X_GAP = 280
const NODE_Y_GAP = 180

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
    const sizePx = nodeAppearance.sizePx ?? 220

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
        width: sizePx,
        height: sizePx,
        borderRadius: 9999,
        border: `1px solid ${nodeAppearance.borderColor ?? 'oklch(0.88 0.01 264)'}`,
        background: nodeAppearance.fillColor
          ? `linear-gradient(180deg, ${nodeAppearance.fillColor} 0%, rgba(255,255,255,0.96) 100%)`
          : 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(246,248,252,0.96) 100%)',
        boxShadow: '0 14px 40px rgba(15, 23, 42, 0.08)',
        fontSize: 12,
        opacity: nodeAppearance.isDimmed ? 0.42 : 1,
      },
    }
  })
}

export function buildDocumentGraphEdges(
  relations: DocumentRelation[],
  selectedRelationId?: string | null,
  hoveredRelationId?: string | null,
): Edge[] {
  return relations.map((relation) => {
    const isAuto = relation.linkOrigin === 'auto'
    const isCitation = relation.linkType === 'citation'
    const isSemanticManual = relation.linkOrigin === 'user' && relation.linkType !== 'manual'
    const isProposed = relation.relationStatus === 'proposed'
    const isRejected = relation.relationStatus === 'rejected'
    const isSelected = relation.id === selectedRelationId
    const isHovered = relation.id === hoveredRelationId
    const semanticColor = relation.linkType === 'supports'
      ? '#15803d'
      : relation.linkType === 'contradicts'
        ? '#b91c1c'
        : relation.linkType === 'same_topic'
          ? '#2563eb'
          : relation.linkType === 'related'
            ? '#7c3aed'
            : '#0f766e'
    const baseColor = isRejected
      ? '#cbd5e1'
      : isProposed
        ? '#d97706'
        : isCitation
          ? '#7c3aed'
          : isSemanticManual
            ? semanticColor
          : isAuto
            ? '#94a3b8'
            : '#0f766e'
    const selectedColor = isProposed
      ? '#b45309'
      : isCitation
        ? '#6d28d9'
        : isSemanticManual
          ? semanticColor
          : isAuto
            ? '#475569'
            : '#0f766e'
    const strokeColor = isSelected || isHovered ? selectedColor : baseColor

    return {
      id: relation.id,
      source: relation.sourceDocumentId,
      target: relation.targetDocumentId,
      type: 'relationship',
      animated: isSelected || isHovered,
      markerStart: isSelected ? {
        type: MarkerType.Arrow,
        width: 14,
        height: 14,
        color: strokeColor,
      } : undefined,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: isSelected ? 28 : 18,
        height: isSelected ? 28 : 18,
        color: strokeColor,
      },
      label: relation.linkType !== 'manual'
        ? relation.label ?? relation.linkType.replace('_', ' ')
        : relation.label,
      style: {
        stroke: strokeColor,
        strokeWidth: isSelected ? 4.5 : isHovered ? 3.2 : isProposed ? 2.6 : isCitation ? 2.2 : isAuto ? 1.6 : 2.4,
        strokeDasharray: isProposed
          ? '4 4'
          : isCitation
            ? '10 5'
            : relation.linkType === 'contradicts'
              ? '3 3'
              : isAuto
                ? '6 4'
                : undefined,
        filter: isSelected
          ? `drop-shadow(0 0 8px ${
            isProposed
              ? 'rgba(217, 119, 6, 0.32)'
              : isCitation
                ? 'rgba(109, 40, 217, 0.32)'
                : 'rgba(15, 118, 110, 0.35)'
          })`
          : undefined,
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
      },
    }
  })
}

export function getDocumentOpenHref(document: Document) {
  return document.documentType === 'physical_book'
    ? `/books/notes?id=${document.id}`
    : `/reader/view?id=${document.id}`
}
