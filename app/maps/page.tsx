'use client'

import Link from 'next/link'
import { GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/refx/common'
import { useAppStore } from '@/lib/store'

export default function MapsPage() {
  const { documents } = useAppStore()

  if (documents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={GitBranch}
          title="Knowledge maps are empty"
          description="Import documents first. This route no longer shows fabricated graph data."
          action={
            <Button asChild>
              <Link href="/libraries">Open Libraries</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Knowledge Maps</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Local graph generation is not implemented yet. This page intentionally stays empty until real relationship data exists.
        </CardContent>
      </Card>
    </div>
  )
}
