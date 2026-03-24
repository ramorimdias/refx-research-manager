'use client'

import { useState } from 'react'
import {
  BarChart3,
  Calendar,
  Download,
  Filter,
  TrendingUp,
  BookOpen,
  Clock,
  Star,
  FileText,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { mockLibraries, mockDocuments } from '@/lib/mock-data'

export default function ReportsPage() {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d')
  const [selectedLibrary, setSelectedLibrary] = useState<string>('all')

  // Calculate statistics
  const getFilteredDocuments = () => {
    let docs = mockDocuments
    if (selectedLibrary !== 'all') {
      docs = docs.filter((d) => d.libraryId === selectedLibrary)
    }
    return docs
  }

  const filteredDocs = getFilteredDocuments()
  const totalDocuments = filteredDocs.length
  const readDocuments = filteredDocs.filter((d) => d.readingStage === 'read').length
  const readingDocuments = filteredDocs.filter((d) => d.readingStage === 'reading').length
  const favoriteCount = filteredDocs.filter((d) => d.favorite).length
  const totalAnnotations = filteredDocs.reduce((sum, d) => sum + (d.annotationCount || 0), 0)
  const totalNotes = filteredDocs.reduce((sum, d) => sum + (d.notesCount || 0), 0)
  const avgPageCount =
    filteredDocs.length > 0
      ? Math.round(
          filteredDocs.reduce((sum, d) => sum + (d.pageCount || 0), 0) / filteredDocs.length
        )
      : 0

  // Reading stage distribution
  const readingStages = {
    unread: filteredDocs.filter((d) => d.readingStage === 'unread').length,
    skimmed: filteredDocs.filter((d) => d.readingStage === 'skimmed').length,
    reading: filteredDocs.filter((d) => d.readingStage === 'reading').length,
    read: filteredDocs.filter((d) => d.readingStage === 'read').length,
  }

  // Most tagged papers
  const tagFrequency: Record<string, number> = {}
  filteredDocs.forEach((doc) => {
    doc.tags.forEach((tag) => {
      tagFrequency[tag] = (tagFrequency[tag] || 0) + 1
    })
  })
  const topTags = Object.entries(tagFrequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold">Reports & Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track your reading progress and research insights
            </p>
          </div>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>

        {/* Controls */}
        <div className="flex gap-4">
          <Select value={selectedLibrary} onValueChange={setSelectedLibrary}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Libraries</SelectItem>
              {mockLibraries.map((lib) => (
                <SelectItem key={lib.id} value={lib.id}>
                  {lib.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as typeof timeRange)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          {/* Key Metrics */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Documents</p>
                    <p className="text-2xl font-semibold mt-1">{totalDocuments}</p>
                  </div>
                  <FileText className="h-8 w-8 text-primary/40" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Read</p>
                    <p className="text-2xl font-semibold mt-1">{readDocuments}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {totalDocuments > 0 ? Math.round((readDocuments / totalDocuments) * 100) : 0}%
                    </p>
                  </div>
                  <BookOpen className="h-8 w-8 text-green-500/40" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Annotations</p>
                    <p className="text-2xl font-semibold mt-1">{totalAnnotations}</p>
                  </div>
                  <Star className="h-8 w-8 text-yellow-500/40" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Notes</p>
                    <p className="text-2xl font-semibold mt-1">{totalNotes}</p>
                  </div>
                  <Clock className="h-8 w-8 text-blue-500/40" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3 lg:w-auto">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="progress">Progress</TabsTrigger>
              <TabsTrigger value="trends">Trends</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Reading Stage Distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Reading Stage Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(readingStages).map(([stage, count]) => (
                        <div key={stage}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium capitalize">{stage}</span>
                            <span className="text-sm text-muted-foreground">{count}</span>
                          </div>
                          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{
                                width: `${totalDocuments > 0 ? (count / totalDocuments) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Top Tags */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Most Used Tags</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {topTags.length > 0 ? (
                        topTags.map(([tag, count]) => (
                          <div
                            key={tag}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-colors"
                          >
                            <span className="text-sm">{tag}</span>
                            <Badge variant="secondary">{count}</Badge>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No tags yet</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Statistics */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Library Statistics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg. Pages per Doc</p>
                      <p className="text-xl font-semibold mt-1">{avgPageCount}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Favorites</p>
                      <p className="text-xl font-semibold mt-1">{favoriteCount}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Currently Reading</p>
                      <p className="text-xl font-semibold mt-1">{readingDocuments}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Unread</p>
                      <p className="text-xl font-semibold mt-1">
                        {readingStages.unread}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="progress" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Reading Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Overall Progress</span>
                        <span className="text-sm font-semibold">
                          {totalDocuments > 0 ? Math.round((readDocuments / totalDocuments) * 100) : 0}%
                        </span>
                      </div>
                      <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-green-500"
                          style={{
                            width: `${totalDocuments > 0 ? (readDocuments / totalDocuments) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      You have read {readDocuments} out of {totalDocuments} documents in your library.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="trends" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Research Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
                    <p className="text-sm text-muted-foreground">
                      Activity trends coming soon. Start reading and annotating to see your research habits.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
