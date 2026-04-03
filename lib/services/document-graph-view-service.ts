'use client'

import type { Document, DocumentRelation, DocumentRelationStatus } from '@/lib/types'

export type GraphRelationFilter =
  | 'all'
  | 'manual'
  | 'citations'
  | 'confirmed_citations'
  | 'proposed_citations'

export type GraphColorMode = 'library' | 'year' | 'density' | 'status' | 'component'
export type GraphSizeMode = 'uniform' | 'inbound_citations' | 'total_degree'
export type GraphScopeMode = 'mapped' | 'library'
export type GraphNeighborhoodDepth = 'full' | '1' | '2'

export type DocumentGraphMetrics = {
  inboundCitationCount: number
  outboundCitationCount: number
  inboundCount: number
  outboundCount: number
  totalDegree: number
  densityBucket: 'low' | 'medium' | 'high'
  componentIndex: number
}

export type DocumentGraphAppearance = {
  borderColor: string
  fillColor: string
  sizePx: number
}

export type DerivedGraphView = {
  documents: Document[]
  relations: DocumentRelation[]
  metrics: Record<string, DocumentGraphMetrics>
  searchMatches: Set<string>
}

let metricsCache: {
  documentsRef: Document[]
  relationsRef: DocumentRelation[]
  result: Record<string, DocumentGraphMetrics>
} | null = null

export function buildDocumentGraphMetrics(
  documents: Document[],
  relations: DocumentRelation[],
): Record<string, DocumentGraphMetrics> {
  if (
    metricsCache
    && metricsCache.documentsRef === documents
    && metricsCache.relationsRef === relations
  ) {
    return metricsCache.result
  }

  const result = buildDocumentGraphMetricsInternal(documents, relations)
  metricsCache = {
    documentsRef: documents,
    relationsRef: relations,
    result,
  }
  return result
}

function buildDocumentGraphMetricsInternal(
  documents: Document[],
  relations: DocumentRelation[],
): Record<string, DocumentGraphMetrics> {
  const metrics: Record<string, DocumentGraphMetrics> = Object.fromEntries(
    documents.map((document) => [document.id, {
      inboundCitationCount: 0,
      outboundCitationCount: 0,
      inboundCount: 0,
      outboundCount: 0,
      totalDegree: 0,
      densityBucket: 'low' as const,
      componentIndex: -1,
    }]),
  )

  const adjacency = new Map<string, Set<string>>()
  for (const document of documents) {
    adjacency.set(document.id, new Set())
  }

  for (const relation of relations) {
    metrics[relation.sourceDocumentId] ??= {
      inboundCitationCount: 0,
      outboundCitationCount: 0,
      inboundCount: 0,
      outboundCount: 0,
      totalDegree: 0,
      densityBucket: 'low',
      componentIndex: -1,
    }
    metrics[relation.targetDocumentId] ??= {
      inboundCitationCount: 0,
      outboundCitationCount: 0,
      inboundCount: 0,
      outboundCount: 0,
      totalDegree: 0,
      densityBucket: 'low',
      componentIndex: -1,
    }
    adjacency.get(relation.sourceDocumentId)?.add(relation.targetDocumentId)
    adjacency.get(relation.targetDocumentId)?.add(relation.sourceDocumentId)

    metrics[relation.sourceDocumentId].outboundCount += 1
    metrics[relation.targetDocumentId].inboundCount += 1
    metrics[relation.sourceDocumentId].totalDegree += 1
    metrics[relation.targetDocumentId].totalDegree += 1

    if (relation.linkType === 'citation') {
      metrics[relation.sourceDocumentId].outboundCitationCount += 1
      metrics[relation.targetDocumentId].inboundCitationCount += 1
    }
  }

  for (const metric of Object.values(metrics)) {
    metric.densityBucket = metric.totalDegree >= 6 ? 'high' : metric.totalDegree >= 3 ? 'medium' : 'low'
  }

  let componentIndex = 0
  const visited = new Set<string>()
  for (const document of documents) {
    if (visited.has(document.id)) continue
    const queue = [document.id]
    visited.add(document.id)
    while (queue.length > 0) {
      const currentId = queue.shift()!
      if (metrics[currentId]) {
        metrics[currentId].componentIndex = componentIndex
      }
      for (const neighborId of adjacency.get(currentId) ?? []) {
        if (visited.has(neighborId)) continue
        visited.add(neighborId)
        queue.push(neighborId)
      }
    }
    componentIndex += 1
  }

  return metrics
}

function matchesRelationFilter(relation: DocumentRelation, relationFilter: GraphRelationFilter) {
  if (relation.linkType === 'citation' && relation.relationStatus === 'rejected') return false

  switch (relationFilter) {
    case 'manual':
      return relation.linkOrigin === 'user'
    case 'citations':
      return relation.linkType === 'citation'
    case 'confirmed_citations':
      return relation.linkType === 'citation'
        && (relation.relationStatus === 'confirmed'
          || relation.relationStatus === 'auto_confirmed'
          || relation.relationStatus === undefined)
    case 'proposed_citations':
      return relation.linkType === 'citation' && relation.relationStatus === 'proposed'
    case 'all':
    default:
      return true
  }
}

function relationConfidenceValue(relation: DocumentRelation) {
  return relation.linkType === 'manual' ? 1 : relation.confidence ?? 0
}

function collectNeighborIds(
  startId: string,
  relations: DocumentRelation[],
  maxDepth: number,
) {
  const adjacency = new Map<string, Set<string>>()
  for (const relation of relations) {
    if (!adjacency.has(relation.sourceDocumentId)) adjacency.set(relation.sourceDocumentId, new Set())
    if (!adjacency.has(relation.targetDocumentId)) adjacency.set(relation.targetDocumentId, new Set())
    adjacency.get(relation.sourceDocumentId)?.add(relation.targetDocumentId)
    adjacency.get(relation.targetDocumentId)?.add(relation.sourceDocumentId)
  }

  const visited = new Set<string>([startId])
  let frontier = new Set<string>([startId])

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const nextFrontier = new Set<string>()
    for (const nodeId of frontier) {
      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (visited.has(neighbor)) continue
        visited.add(neighbor)
        nextFrontier.add(neighbor)
      }
    }
    frontier = nextFrontier
    if (frontier.size === 0) break
  }

  return visited
}

export function deriveGraphView(input: {
  documents: Document[]
  relations: DocumentRelation[]
  relationFilter: GraphRelationFilter
  confidenceThreshold: number
  selectedDocumentId?: string | null
  neighborhoodDepth: GraphNeighborhoodDepth
  focusMode: boolean
  scopeMode: GraphScopeMode
  manualVisibleDocumentIds: string[]
  hiddenDocumentIds?: string[]
  yearMin?: number
  yearMax?: number
  hideOrphans: boolean
  searchQuery: string
}) {
  const {
    documents,
    relations,
    relationFilter,
    confidenceThreshold,
    selectedDocumentId,
    neighborhoodDepth,
    focusMode,
    scopeMode,
    manualVisibleDocumentIds,
    hiddenDocumentIds = [],
    yearMin,
    yearMax,
    hideOrphans,
    searchQuery,
  } = input

  const searchNormalized = searchQuery.trim().toLowerCase()
  const filteredRelations = relations.filter((relation) =>
    matchesRelationFilter(relation, relationFilter) && relationConfidenceValue(relation) >= confidenceThreshold,
  )

  const connectedIds = new Set<string>()
  for (const relation of filteredRelations) {
    connectedIds.add(relation.sourceDocumentId)
    connectedIds.add(relation.targetDocumentId)
  }

  const scopedBaseIds = scopeMode === 'mapped'
    ? new Set<string>([...manualVisibleDocumentIds, ...connectedIds, ...(selectedDocumentId ? [selectedDocumentId] : [])])
    : new Set(documents.map((document) => document.id))

  let visibleDocuments = documents.filter((document) => scopedBaseIds.has(document.id))
  if (hiddenDocumentIds.length > 0) {
    const hiddenIds = new Set(hiddenDocumentIds)
    visibleDocuments = visibleDocuments.filter((document) => !hiddenIds.has(document.id))
  }
  if (yearMin !== undefined) {
    visibleDocuments = visibleDocuments.filter((document) => (document.year ?? Number.MIN_SAFE_INTEGER) >= yearMin)
  }
  if (yearMax !== undefined) {
    visibleDocuments = visibleDocuments.filter((document) => (document.year ?? Number.MAX_SAFE_INTEGER) <= yearMax)
  }

  let visibleRelations = filteredRelations.filter((relation) =>
    visibleDocuments.some((document) => document.id === relation.sourceDocumentId)
    && visibleDocuments.some((document) => document.id === relation.targetDocumentId),
  )

  if (focusMode && selectedDocumentId && neighborhoodDepth !== 'full') {
    const hopCount = neighborhoodDepth === '1' ? 1 : 2
    const focusIds = collectNeighborIds(selectedDocumentId, visibleRelations, hopCount)
    visibleDocuments = visibleDocuments.filter((document) => focusIds.has(document.id))
    visibleRelations = visibleRelations.filter(
      (relation) => focusIds.has(relation.sourceDocumentId) && focusIds.has(relation.targetDocumentId),
    )
  }

  if (hideOrphans) {
    const activeIds = new Set<string>()
    for (const relation of visibleRelations) {
      activeIds.add(relation.sourceDocumentId)
      activeIds.add(relation.targetDocumentId)
    }
    visibleDocuments = visibleDocuments.filter((document) => activeIds.has(document.id) || document.id === selectedDocumentId)
  }

  const searchMatches = new Set(
    visibleDocuments
      .filter((document) => searchNormalized.length > 0 && document.title.toLowerCase().includes(searchNormalized))
      .map((document) => document.id),
  )

  return {
    documents: visibleDocuments,
    relations: visibleRelations,
    metrics: buildDocumentGraphMetrics(visibleDocuments, visibleRelations),
    searchMatches,
  } satisfies DerivedGraphView
}

function interpolateColor(left: [number, number, number], right: [number, number, number], amount: number) {
  const value = left.map((channel, index) => Math.round(channel + (right[index] - channel) * amount))
  return `rgb(${value[0]}, ${value[1]}, ${value[2]})`
}

export function buildNodeAppearance(input: {
  document: Document
  metrics: DocumentGraphMetrics | undefined
  colorMode: GraphColorMode
  sizeMode: GraphSizeMode
  activeLibraryColor?: string
  currentDocumentId?: string | null
  isSelected: boolean
  isHovered: boolean
  isFocused: boolean
  isSearchMatch: boolean
}) {
  const {
    document,
    metrics,
    colorMode,
    sizeMode,
    activeLibraryColor,
    currentDocumentId,
    isSelected,
    isHovered,
    isFocused,
    isSearchMatch,
  } = input

  const degree = metrics?.totalDegree ?? 0
  const inboundCitations = metrics?.inboundCitationCount ?? 0

  const baseSize = sizeMode === 'total_degree'
    ? 180 + Math.min(100, degree * 10)
    : sizeMode === 'inbound_citations'
      ? 180 + Math.min(100, inboundCitations * 16)
      : 200

  let fillColor = '#ffffff'
  if (colorMode === 'library') {
    fillColor = activeLibraryColor ?? '#dbeafe'
  } else if (colorMode === 'year') {
    const year = document.year ?? new Date().getFullYear()
    const normalized = Math.max(0, Math.min(1, (year - 1980) / 50))
    fillColor = interpolateColor([224, 231, 255], [16, 185, 129], normalized)
  } else if (colorMode === 'density') {
    fillColor = metrics?.densityBucket === 'high'
      ? '#c4b5fd'
      : metrics?.densityBucket === 'medium'
        ? '#bfdbfe'
        : '#e2e8f0'
  } else if (colorMode === 'status') {
    fillColor = document.readingStage === 'finished'
      ? '#bbf7d0'
      : document.readingStage === 'reading'
        ? '#fde68a'
        : document.metadataStatus === 'complete'
          ? '#bfdbfe'
          : '#e2e8f0'
  } else if (colorMode === 'component') {
    const palette = ['#bfdbfe', '#fecaca', '#c7d2fe', '#fde68a', '#a7f3d0', '#fbcfe8']
    fillColor = palette[(metrics?.componentIndex ?? 0) % palette.length] ?? '#e2e8f0'
  }

  let borderColor = '#cbd5e1'
  if (currentDocumentId === document.id) borderColor = '#0f766e'
  if (isSearchMatch) borderColor = '#f59e0b'
  if (isFocused) borderColor = '#7c3aed'
  if (isHovered) borderColor = '#0ea5e9'
  if (isSelected) borderColor = '#0f766e'

  return {
    borderColor,
    fillColor,
    sizePx: baseSize,
  } satisfies DocumentGraphAppearance
}

export function runReheatLayout(input: {
  nodeIds: string[]
  relations: { sourceDocumentId: string; targetDocumentId: string }[]
  currentPositions: Map<string, { x: number; y: number }>
}) {
  const { nodeIds, relations, currentPositions } = input
  const positions = new Map<string, { x: number; y: number }>()
  const center = { x: 720, y: 420 }
  const minSpacing = 320
  const orderedNodeIds = [...nodeIds]

  for (const [index, nodeId] of orderedNodeIds.entries()) {
    const seedAngle = (index / Math.max(1, orderedNodeIds.length)) * Math.PI * 2
    const seedRadius = 180 + Math.floor(index / 10) * 110
    positions.set(nodeId, currentPositions.get(nodeId) ?? {
      x: center.x + Math.cos(seedAngle) * seedRadius,
      y: center.y + Math.sin(seedAngle) * seedRadius,
    })
  }

  for (let iteration = 0; iteration < 96; iteration += 1) {
    const displacements = new Map<string, { x: number; y: number }>(
      orderedNodeIds.map((nodeId) => [nodeId, { x: 0, y: 0 }]),
    )

    for (let i = 0; i < orderedNodeIds.length; i += 1) {
      for (let j = i + 1; j < orderedNodeIds.length; j += 1) {
        const left = positions.get(orderedNodeIds[i])!
        const right = positions.get(orderedNodeIds[j])!
        const dx = left.x - right.x
        const dy = left.y - right.y
        const distance = Math.max(1, Math.hypot(dx, dy))
        const collisionStrength = distance < minSpacing
          ? ((minSpacing - distance) / minSpacing) * 14
          : 0
        const repulsion = 30000 / (distance * distance)
        const force = repulsion + collisionStrength
        const xForce = (dx / distance) * force
        const yForce = (dy / distance) * force
        displacements.get(orderedNodeIds[i])!.x += xForce
        displacements.get(orderedNodeIds[i])!.y += yForce
        displacements.get(orderedNodeIds[j])!.x -= xForce
        displacements.get(orderedNodeIds[j])!.y -= yForce
      }
    }

    for (const relation of relations) {
      const source = positions.get(relation.sourceDocumentId)
      const target = positions.get(relation.targetDocumentId)
      if (!source || !target) continue
      const dx = target.x - source.x
      const dy = target.y - source.y
      const distance = Math.max(1, Math.hypot(dx, dy))
      const spring = (distance - 280) * 0.0018
      const xForce = (dx / distance) * spring
      const yForce = (dy / distance) * spring
      displacements.get(relation.sourceDocumentId)!.x += xForce
      displacements.get(relation.sourceDocumentId)!.y += yForce
      displacements.get(relation.targetDocumentId)!.x -= xForce
      displacements.get(relation.targetDocumentId)!.y -= yForce
    }

    for (const nodeId of orderedNodeIds) {
      const current = positions.get(nodeId)!
      const displacement = displacements.get(nodeId)!
      const dxToCenter = center.x - current.x
      const dyToCenter = center.y - current.y
      const centeringX = dxToCenter * 0.0018
      const centeringY = dyToCenter * 0.0018
      const temperature = 1 - iteration / 96
      positions.set(nodeId, {
        x: current.x + (displacement.x + centeringX) * (14 + temperature * 10),
        y: current.y + (displacement.y + centeringY) * (14 + temperature * 10),
      })
    }
  }

  for (let iteration = 0; iteration < 8; iteration += 1) {
    for (let i = 0; i < orderedNodeIds.length; i += 1) {
      for (let j = i + 1; j < orderedNodeIds.length; j += 1) {
        const leftId = orderedNodeIds[i]
        const rightId = orderedNodeIds[j]
        const left = positions.get(leftId)!
        const right = positions.get(rightId)!
        const dx = right.x - left.x
        const dy = right.y - left.y
        const distance = Math.max(1, Math.hypot(dx, dy))

        if (distance >= minSpacing) continue

        const overlap = (minSpacing - distance) / 2
        const unitX = dx / distance
        const unitY = dy / distance

        positions.set(leftId, {
          x: left.x - unitX * overlap,
          y: left.y - unitY * overlap,
        })
        positions.set(rightId, {
          x: right.x + unitX * overlap,
          y: right.y + unitY * overlap,
        })
      }
    }
  }

  return positions
}
