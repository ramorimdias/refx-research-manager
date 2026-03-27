'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type SelectionModifiers = {
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}

export function useDocumentListSelection(documentIds: string[]) {
  const documentIdsKey = useMemo(() => documentIds.join('|'), [documentIds])
  const orderedDocumentIds = useMemo(
    () => Array.from(new Set(documentIds.filter(Boolean))),
    [documentIdsKey],
  )
  const documentIdSet = useMemo(() => new Set(orderedDocumentIds), [orderedDocumentIds])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const anchorIdRef = useRef<string | null>(null)

  useEffect(() => {
    setSelectedIds((current) => {
      const next = new Set(Array.from(current).filter((id) => documentIdSet.has(id)))
      if (next.size === current.size) {
        return current
      }
      return next
    })

    if (anchorIdRef.current && !documentIdSet.has(anchorIdRef.current)) {
      anchorIdRef.current = null
    }
  }, [documentIdSet])

  const orderedSelectedIds = useMemo(
    () => orderedDocumentIds.filter((id) => selectedIds.has(id)),
    [orderedDocumentIds, selectedIds],
  )

  const clearSelection = useCallback(() => {
    anchorIdRef.current = null
    setSelectedIds(new Set())
  }, [])

  const replaceSelection = useCallback((id: string) => {
    anchorIdRef.current = id
    setSelectedIds(new Set([id]))
  }, [])

  const toggleSelection = useCallback((id: string) => {
    anchorIdRef.current = id
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectRange = useCallback(
    (id: string) => {
      const anchorId = anchorIdRef.current
      const endIndex = orderedDocumentIds.indexOf(id)

      if (!anchorId || endIndex === -1) {
        replaceSelection(id)
        return
      }

      const startIndex = orderedDocumentIds.indexOf(anchorId)
      if (startIndex === -1) {
        replaceSelection(id)
        return
      }

      const [from, to] = startIndex <= endIndex
        ? [startIndex, endIndex]
        : [endIndex, startIndex]

      anchorIdRef.current = id
      setSelectedIds(new Set(orderedDocumentIds.slice(from, to + 1)))
    },
    [orderedDocumentIds, replaceSelection],
  )

  const selectWithModifiers = useCallback(
    (id: string, modifiers?: SelectionModifiers) => {
      if (!documentIdSet.has(id)) {
        return
      }

      if (modifiers?.shiftKey) {
        selectRange(id)
        return
      }

      if (modifiers?.metaKey || modifiers?.ctrlKey) {
        toggleSelection(id)
        return
      }

      replaceSelection(id)
    },
    [documentIdSet, replaceSelection, selectRange, toggleSelection],
  )

  const toggleAll = useCallback(() => {
    if (orderedSelectedIds.length === orderedDocumentIds.length) {
      clearSelection()
      return
    }

    if (orderedDocumentIds.length > 0) {
      anchorIdRef.current = orderedDocumentIds[orderedDocumentIds.length - 1]
      setSelectedIds(new Set(orderedDocumentIds))
    }
  }, [clearSelection, orderedDocumentIds, orderedSelectedIds.length])

  return {
    selectedIds,
    selectedCount: orderedSelectedIds.length,
    selectedDocumentIds: orderedSelectedIds,
    hasSelection: orderedSelectedIds.length > 0,
    isAllSelected: orderedDocumentIds.length > 0 && orderedSelectedIds.length === orderedDocumentIds.length,
    isPartiallySelected: orderedSelectedIds.length > 0 && orderedSelectedIds.length < orderedDocumentIds.length,
    isSelected: (id: string) => selectedIds.has(id),
    clearSelection,
    selectWithModifiers,
    toggleSelection,
    toggleAll,
  }
}
