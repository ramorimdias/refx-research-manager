'use client'

import { Filter, Search as SearchIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export default function SearchTourPage() {
  return (
    <div className="p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <SearchIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Search</h1>
            <p className="text-sm text-muted-foreground">
              Explore your library with simple queries, grouped keywords, and focused filters.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="h-fit" data-tour-id="search-query">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SearchIcon className="h-5 w-5" />
                Search Workspace
              </CardTitle>
              <CardDescription>
                This demo step shows where simple search, grouped logic, and filters live.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium">Query Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button">Simple</Button>
                  <Button type="button" variant="outline">Complex</Button>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border p-3">
                <label className="text-sm font-medium">Quick Search</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value="climate policy adaptation"
                      readOnly
                      className="pl-9"
                    />
                  </div>
                  <Button type="button">Search</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Try a quick query here, or switch to grouped logic when you need more control.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Filters</label>
                <div className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                  Library, reading stage, metadata quality, favorites, and search flexibility all live in this panel.
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4" data-tour-id="search-results">
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <p className="text-sm text-muted-foreground">Sample results</p>
                  <p className="font-medium">2 matches for “climate policy adaptation”</p>
                </div>
                <Badge variant="secondary" className="gap-1.5">
                  <Filter className="h-3.5 w-3.5" />
                  Balanced
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 py-6">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">Policy Pathways for Urban Climate Adaptation</h2>
                  <p className="text-sm text-muted-foreground">Jane Doe, Alex Silva • Research Library</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Finished</Badge>
                  <Badge variant="secondary">Complete metadata</Badge>
                  <Badge variant="outline">adaptation: 8</Badge>
                  <Badge variant="outline">policy: 5</Badge>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  Preview snippets, page hits, and quick actions appear here after you run a search.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button">Open Reader</Button>
                  <Button type="button" variant="outline">Open Details</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
