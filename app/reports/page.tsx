'use client'

import { useMemo } from 'react'
import { BookOpen, Clock, FileText, Star } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, StatsCard } from '@/components/refx/common'
import { useAppStore } from '@/lib/store'

export default function ReportsPage() {
  const { documents, notes } = useAppStore()

  const stats = useMemo(() => {
    const totalDocuments = documents.length
    const readDocuments = documents.filter((document) => document.readingStage === 'read').length
    const readingDocuments = documents.filter((document) => document.readingStage === 'reading').length
    const favoriteCount = documents.filter((document) => document.favorite).length
    const averageRating =
      documents.length > 0
        ? (
            documents.reduce((sum, document) => sum + document.rating, 0) / documents.length
          ).toFixed(1)
        : '0.0'

    return { totalDocuments, readDocuments, readingDocuments, favoriteCount, averageRating }
  }, [documents])

  if (documents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={FileText}
          title="No analytics yet"
          description="Reports will populate after you import real local documents."
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-6">
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">Simple analytics based on your local workspace.</p>
      </div>

      <div className="space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatsCard label="Total Documents" value={stats.totalDocuments} icon={FileText} />
          <StatsCard label="Read" value={stats.readDocuments} icon={BookOpen} />
          <StatsCard label="Currently Reading" value={stats.readingDocuments} icon={Clock} />
          <StatsCard label="Favorites" value={stats.favoriteCount} icon={Star} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reading Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {stats.readDocuments} of {stats.totalDocuments} documents are marked as read.
              </p>
              <p className="text-sm text-muted-foreground">
                {stats.readingDocuments} documents are currently in progress.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workspace Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">Average rating: {stats.averageRating}</p>
              <p className="text-sm text-muted-foreground">Notes stored locally: {notes.length}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
