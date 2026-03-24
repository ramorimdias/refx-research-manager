'use client'

import { useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Filter,
  Download,
  RefreshCw,
  FileText,
  User,
  Tag,
  Layers,
  Eye,
  EyeOff,
  MoreHorizontal,
  ChevronRight,
  Sparkles,
  Grid2x2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  mockGraphNodes,
  mockGraphEdges,
  mockTopicClusters,
  mockDocuments,
  mockTags,
} from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import type { GraphNodeType } from '@/lib/types'

// Generate positions for nodes in a force-directed-like layout
function generateNodePositions(nodes: typeof mockGraphNodes) {
  const positions: Record<string, { x: number; y: number }> = {}
  const width = 800
  const height = 600
  const centerX = width / 2
  const centerY = height / 2

  nodes.forEach((node, index) => {
    const angle = (index / nodes.length) * 2 * Math.PI
    const radius = 150 + (index % 3) * 80
    positions[node.id] = {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    }
  })

  return positions
}

const nodeColors: Record<GraphNodeType, string> = {
  document: '#3B82F6',
  author: '#10B981',
  tag: '#F59E0B',
  topic: '#8B5CF6',
}

const nodeIcons: Record<GraphNodeType, typeof FileText> = {
  document: FileText,
  author: User,
  tag: Tag,
  topic: Layers,
}

export default function MapsPage() {
  const [zoom, setZoom] = useState(100)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [visibleTypes, setVisibleTypes] = useState<GraphNodeType[]>([
    'document',
    'author',
    'tag',
    'topic',
  ])
  const [showLabels, setShowLabels] = useState(true)
  const [showEdges, setShowEdges] = useState(true)
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)

  const nodePositions = useMemo(() => generateNodePositions(mockGraphNodes), [])

  const visibleNodes = mockGraphNodes.filter((node) => visibleTypes.includes(node.type))
  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id))
  const visibleEdges = showEdges
    ? mockGraphEdges.filter(
        (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
      )
    : []

  const selectedNode = selectedNodeId
    ? mockGraphNodes.find((n) => n.id === selectedNodeId)
    : null

  const toggleNodeType = (type: GraphNodeType) => {
    setVisibleTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  const getNodeDocument = (nodeId: string) => {
    const node = mockGraphNodes.find((n) => n.id === nodeId)
    if (node?.type === 'document') {
      return mockDocuments.find((d) => d.id === nodeId.replace('node-doc-', 'doc-'))
    }
    return null
  }

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h1 className="text-xl font-semibold">Knowledge Maps</h1>
            <p className="text-sm text-muted-foreground">
              Explore connections between papers, authors, and topics
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <RefreshCw className="mr-2 h-4 w-4" />
              Regenerate
            </Button>
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Controls Panel */}
          <div className="w-64 shrink-0 border-r border-border overflow-auto">
            <div className="p-4 space-y-6">
              {/* Zoom */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Zoom</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setZoom(Math.max(50, zoom - 25))}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Slider
                    value={[zoom]}
                    min={50}
                    max={200}
                    step={25}
                    onValueChange={(v) => setZoom(v[0])}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setZoom(Math.min(200, zoom + 25))}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </div>
                <div className="text-center text-xs text-muted-foreground">{zoom}%</div>
              </div>

              <Separator />

              {/* Node Types */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Show Node Types</Label>
                <div className="space-y-2">
                  {(['document', 'author', 'tag', 'topic'] as GraphNodeType[]).map((type) => {
                    const Icon = nodeIcons[type]
                    return (
                      <div key={type} className="flex items-center space-x-2">
                        <Checkbox
                          id={`type-${type}`}
                          checked={visibleTypes.includes(type)}
                          onCheckedChange={() => toggleNodeType(type)}
                        />
                        <Label
                          htmlFor={`type-${type}`}
                          className="flex items-center gap-2 cursor-pointer capitalize"
                        >
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: nodeColors[type] }}
                          />
                          {type}s
                        </Label>
                      </div>
                    )
                  })}
                </div>
              </div>

              <Separator />

              {/* Display Options */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Display</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="show-labels"
                      checked={showLabels}
                      onCheckedChange={(checked) => setShowLabels(!!checked)}
                    />
                    <Label htmlFor="show-labels" className="cursor-pointer">
                      Show labels
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="show-edges"
                      checked={showEdges}
                      onCheckedChange={(checked) => setShowEdges(!!checked)}
                    />
                    <Label htmlFor="show-edges" className="cursor-pointer">
                      Show connections
                    </Label>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Topic Clusters */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Topic Clusters</Label>
                <div className="space-y-2">
                  {mockTopicClusters.map((cluster) => (
                    <button
                      key={cluster.id}
                      className={cn(
                        'w-full flex items-center justify-between p-2 rounded-lg transition-colors text-left',
                        selectedCluster === cluster.id
                          ? 'bg-secondary border border-primary'
                          : 'hover:bg-muted'
                      )}
                      onClick={() => setSelectedCluster(selectedCluster === cluster.id ? null : cluster.id)}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: cluster.color }}
                        />
                        <span className="text-sm truncate">{cluster.name}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {cluster.documentIds.length}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Graph Canvas */}
          <div className="flex-1 relative overflow-hidden bg-muted/30">
            <svg
              className="w-full h-full"
              viewBox={`0 0 ${800 * (zoom / 100)} ${600 * (zoom / 100)}`}
              style={{ minWidth: 800, minHeight: 600 }}
            >
              {/* Edges */}
              <g className="edges">
                {visibleEdges.map((edge) => {
                  const sourcePos = nodePositions[edge.source]
                  const targetPos = nodePositions[edge.target]
                  if (!sourcePos || !targetPos) return null
                  return (
                    <line
                      key={edge.id}
                      x1={sourcePos.x}
                      y1={sourcePos.y}
                      x2={targetPos.x}
                      y2={targetPos.y}
                      stroke="currentColor"
                      strokeWidth={1}
                      className="text-border"
                      opacity={0.3}
                    />
                  )
                })}
              </g>

              {/* Nodes */}
              <g className="nodes">
                {visibleNodes.map((node) => {
                  const pos = nodePositions[node.id]
                  if (!pos) return null
                  const isSelected = selectedNodeId === node.id
                  const isHovered = hoveredNodeId === node.id
                  const selectedClusterData = selectedCluster
                    ? mockTopicClusters.find((c) => c.id === selectedCluster)
                    : null
                  const isInSelectedCluster = selectedClusterData?.documentIds.includes(
                    node.id.replace('node-doc-', 'doc-')
                  )
                  const radius = node.type === 'document' ? 24 : node.type === 'topic' ? 28 : 20

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${pos.x}, ${pos.y})`}
                      className="cursor-pointer"
                      onClick={() => setSelectedNodeId(node.id)}
                      onMouseEnter={() => setHoveredNodeId(node.id)}
                      onMouseLeave={() => setHoveredNodeId(null)}
                    >
                      <circle
                        r={radius}
                        fill={nodeColors[node.type]}
                        opacity={
                          isSelected || isHovered || !selectedCluster || isInSelectedCluster
                            ? 0.9
                            : 0.3
                        }
                        className={cn(
                          'transition-all',
                          isSelected && 'stroke-[3] stroke-foreground',
                          isHovered && 'stroke-[2] stroke-primary'
                        )}
                      />
                      {showLabels && (
                        <text
                          y={radius + 14}
                          textAnchor="middle"
                          className={cn(
                            'text-xs fill-foreground transition-opacity',
                            !selectedCluster || isInSelectedCluster ? 'opacity-100' : 'opacity-40'
                          )}
                          style={{ fontSize: 10 }}
                        >
                          {node.label.length > 20
                            ? node.label.slice(0, 20) + '...'
                            : node.label}
                        </text>
                      )}
                    </g>
                  )
                })}
              </g>
            </svg>

            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-background/90 backdrop-blur border border-border rounded-lg p-3">
              <div className="flex items-center gap-4 text-xs">
                {(['document', 'author', 'tag', 'topic'] as GraphNodeType[]).map((type) => (
                  <div key={type} className="flex items-center gap-1.5">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: nodeColors[type] }}
                    />
                    <span className="capitalize">{type}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Mini Map */}
            <div className="absolute bottom-4 right-4 w-32 h-24 bg-background/90 backdrop-blur border border-border rounded-lg overflow-hidden">
              <svg viewBox="0 0 800 600" className="w-full h-full">
                {visibleNodes.map((node) => {
                  const pos = nodePositions[node.id]
                  if (!pos) return null
                  return (
                    <circle
                      key={node.id}
                      cx={pos.x}
                      cy={pos.y}
                      r={4}
                      fill={nodeColors[node.type]}
                    />
                  )
                })}
              </svg>
            </div>
          </div>

          {/* Inspector Panel */}
          {(selectedNode || selectedCluster) && (
            <div className="w-80 shrink-0 border-l border-border overflow-auto">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold">
                  {selectedNode ? 'Node' : 'Cluster'} Details
                </h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setSelectedNodeId(null)
                    setSelectedCluster(null)
                  }}
                >
                  ×
                </Button>
              </div>
              <div className="p-4 space-y-4">
                {selectedNode ? (
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: nodeColors[selectedNode.type] }}
                    >
                      {(() => {
                        const Icon = nodeIcons[selectedNode.type]
                        return <Icon className="h-5 w-5 text-white" />
                      })()}
                    </div>
                    <div>
                      <Badge variant="secondary" className="capitalize text-xs mb-1">
                        {selectedNode.type}
                      </Badge>
                      <h4 className="font-medium">{selectedNode.label}</h4>
                    </div>
                  </div>
                ) : null}
                {selectedCluster && (() => {
                  const clusterData = mockTopicClusters.find((c) => c.id === selectedCluster)
                  return clusterData ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-10 w-10 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: clusterData.color }}
                        >
                          <Grid2x2 className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <Badge variant="secondary" className="text-xs mb-1">
                            Topic Cluster
                          </Badge>
                          <h4 className="font-medium">{clusterData.name}</h4>
                        </div>
                      </div>
                      <Separator />
                      <div>
                        <Label className="text-xs text-muted-foreground">Description</Label>
                        <p className="text-sm mt-1">{clusterData.description}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Keywords</Label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {clusterData.keywords.map((kw) => (
                            <Badge key={kw} variant="secondary" className="text-xs">
                              {kw}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Documents</Label>
                        <p className="text-sm mt-1">{clusterData.documentIds.length} papers</p>
                      </div>
                    </div>
                  ) : null
                })()}

                {selectedNode && selectedNode.type === 'document' && (
                  <div className="space-y-3">
                    {(() => {
                      const doc = getNodeDocument(selectedNode.id)
                      if (!doc) return null
                      return (
                        <>
                          <div>
                            <Label className="text-xs text-muted-foreground">Authors</Label>
                            <p className="text-sm">{doc.authors.join(', ')}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Year</Label>
                            <p className="text-sm">{doc.year}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Tags</Label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {doc.tags.map((tag) => (
                                <Badge key={tag} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <Button variant="outline" size="sm" asChild className="w-full">
                            <Link href={`/documents/${doc.id}`}>
                              Open Document
                              <ChevronRight className="ml-2 h-4 w-4" />
                            </Link>
                          </Button>
                        </>
                      )
                    })()}
                  </div>
                )}

                {selectedNode && (
                  <>
                    <Separator />

                    <div>
                      <Label className="text-xs text-muted-foreground">Connections</Label>
                      <p className="text-sm mt-1">
                        {
                          mockGraphEdges.filter(
                            (e) => e.source === selectedNode.id || e.target === selectedNode.id
                          ).length
                        }{' '}
                        connections
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
