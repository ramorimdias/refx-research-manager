'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { ArrowRight, Clock, FileText, Upload } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/refx/common'
import { useAppStore } from '@/lib/store'

export default function HomePage() {
  const { documents, isDesktopApp, importDocuments } = useAppStore()
  const recent = useMemo(() => [...documents].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 8), [documents])

  const handleImport = async () => {
    if (!isDesktopApp) return
    await importDocuments()
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">Local-first research workspace</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Total Documents</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{documents.length}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Mode</CardTitle>
          </CardHeader>
          <CardContent className="text-lg">{isDesktopApp ? 'Desktop' : 'Local Preview'}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button asChild size="sm">
              <Link href="/libraries">
                Open Library
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleImport()} disabled={!isDesktopApp}>
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Recent Documents
          </CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/libraries">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recent.length > 0 ? (
            <div className="space-y-2">
              {recent.map((document) => (
                <Link key={document.id} href={`/reader/view?id=${document.id}`} className="block rounded border p-3 hover:bg-muted/30">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span className="font-medium">{document.title}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FileText}
              title="No local documents yet"
              description="Import PDFs into your local library to populate the dashboard."
              action={
                <Button onClick={() => void handleImport()} disabled={!isDesktopApp}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import PDFs
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
