'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { DocumentEphemeralUiFlags } from '@/lib/types'

type ViewFlagState = {
  currentPage: number
  newIds: Set<string>
  seenIds: Set<string>
  sessionKey: string
}

export function useDocumentViewFlags({
  currentPage,
  documentIds,
  sessionKey,
}: {
  currentPage: number
  documentIds: string[]
  sessionKey: string
}) {
  const [flagsById, setFlagsById] = useState<Record<string, DocumentEphemeralUiFlags>>({})
  const stateRef = useRef<ViewFlagState | null>(null)
  const documentIdsKey = useMemo(() => documentIds.join('|'), [documentIds])

  useEffect(() => {
    const visibleIds = Array.from(new Set(documentIds.filter(Boolean)))
    const previous = stateRef.current
    const shouldReset = !previous || previous.currentPage !== currentPage || previous.sessionKey !== sessionKey

    if (shouldReset) {
      stateRef.current = {
        currentPage,
        newIds: new Set(),
        seenIds: new Set(visibleIds),
        sessionKey,
      }
      setFlagsById({})
      return
    }

    const nextSeenIds = new Set(previous.seenIds)
    const nextNewIds = new Set(previous.newIds)

    for (const id of visibleIds) {
      if (!nextSeenIds.has(id)) {
        nextSeenIds.add(id)
        nextNewIds.add(id)
      }
    }

    stateRef.current = {
      currentPage,
      newIds: nextNewIds,
      seenIds: nextSeenIds,
      sessionKey,
    }

    setFlagsById(
      Object.fromEntries(
        visibleIds
          .filter((id) => nextNewIds.has(id))
          .map((id) => [id, { isNewlyAdded: true } satisfies DocumentEphemeralUiFlags]),
      ),
    )
  }, [currentPage, documentIdsKey, sessionKey])

  return flagsById
}
