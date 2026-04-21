'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CheckedState } from '@radix-ui/react-checkbox'
import { BookMarked, Check, CheckCheck, ChevronDown, ChevronUp, CircleHelp, FileText, MessageSquare, MoreHorizontal, Search, Settings2, Star } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ContextMenuItem } from '@/components/ui/context-menu'
import { useDocumentListSelection } from '@/lib/hooks/use-document-list-selection'
import { cn } from '@/lib/utils'
import type { Document, DocumentEphemeralUiFlags, ReadingStage } from '@/lib/types'
import { NewBadge, ReadingStageBadge, StarRating } from './common'
import { DocumentBulkActions } from './document-bulk-actions'
import { useDocumentActions } from '@/lib/stores/document-store'
import { DocumentActions, DocumentContextMenu } from './document-actions'
import { translate, useLocale, useT } from '@/lib/localization'
import { hasUsableMetadataTitle } from '@/lib/services/document-metadata-service'

interface DocumentTableProps {
  documents: Document[]
  ephemeralFlagsById?: Record<string, DocumentEphemeralUiFlags>
}

type ColumnKey = 'favorite' | 'title' | 'authors' | 'tags' | 'year' | 'status' | 'comments' | 'rating'

type ColumnDefinition = {
  key: ColumnKey
  label: string
  defaultWidth: number
  minWidth: number
  hideable?: boolean
}

const TABLE_WIDTHS_KEY = 'refx-library-table-widths'
const TABLE_VISIBILITY_KEY = 'refx-library-table-visibility'
const TABLE_ORDER_KEY = 'refx-library-table-order'
const TABLE_CONFIG_EVENT = 'refx-library-table-config-changed'
const SELECTION_IGNORE_SELECTOR = 'a, button, input, textarea, select, [role="checkbox"], [data-selection-ignore="true"]'
const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { key: 'favorite', label: 'icons', defaultWidth: 78, minWidth: 68, hideable: true },
  { key: 'title', label: 'title', defaultWidth: 360, minWidth: 220 },
  { key: 'authors', label: 'authors', defaultWidth: 220, minWidth: 140, hideable: true },
  { key: 'tags', label: 'tags', defaultWidth: 170, minWidth: 140, hideable: true },
  { key: 'year', label: 'year', defaultWidth: 80, minWidth: 70, hideable: true },
  { key: 'status', label: 'status', defaultWidth: 150, minWidth: 120, hideable: true },
  { key: 'comments', label: 'comments', defaultWidth: 170, minWidth: 150, hideable: true },
  { key: 'rating', label: 'rating', defaultWidth: 140, minWidth: 110, hideable: true },
]

const DEFAULT_WIDTHS = Object.fromEntries(COLUMN_DEFINITIONS.map((column) => [column.key, column.defaultWidth])) as Record<ColumnKey, number>
const DEFAULT_VISIBILITY = Object.fromEntries(COLUMN_DEFINITIONS.map((column) => [column.key, true])) as Record<ColumnKey, boolean>
const DEFAULT_ORDER = COLUMN_DEFINITIONS.map((column) => column.key)
const READING_STAGE_OPTIONS: Array<{ value: ReadingStage; label: string }> = [
  { value: 'unread', label: 'Unread' },
  { value: 'reading', label: 'Reading' },
  { value: 'finished', label: 'Finished' },
]

type QuickEditField = 'title' | 'authors' | 'year'

function getTableMetadataState(document: Document) {
  const hasTitle = hasUsableMetadataTitle(document.title)
  const hasAuthors = document.authors.length > 0
  const hasYear = typeof document.year === 'number'
  const hasDoi = (document.doi ?? '').trim().length > 0

  if (hasTitle && hasAuthors && hasYear && hasDoi) {
    return { label: 'Complete', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' }
  }

  if (hasTitle && hasAuthors && hasYear && !hasDoi) {
    return { label: 'Missing DOI', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' }
  }

  if (hasDoi) {
    return { label: 'Fetch Possible', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' }
  }

  return { label: 'Missing', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
}

function loadStoredColumnVisibility() {
  if (typeof window === 'undefined') return DEFAULT_VISIBILITY

  try {
    const storedVisibility = window.localStorage.getItem(TABLE_VISIBILITY_KEY)
    if (!storedVisibility) return DEFAULT_VISIBILITY
    const parsed = JSON.parse(storedVisibility) as Partial<Record<string, boolean>>
    return { ...DEFAULT_VISIBILITY, ...parsed }
  } catch {
    return DEFAULT_VISIBILITY
  }
}

function loadStoredColumnOrder() {
  if (typeof window === 'undefined') return DEFAULT_ORDER

  try {
    const storedOrder = window.localStorage.getItem(TABLE_ORDER_KEY)
    if (!storedOrder) return DEFAULT_ORDER
    const parsed = JSON.parse(storedOrder) as string[]
    const allowedKeys = new Set(DEFAULT_ORDER)
    const nextOrder = parsed.filter((key): key is ColumnKey => allowedKeys.has(key as ColumnKey))
    const missing = DEFAULT_ORDER.filter((key) => !nextOrder.includes(key))
    return nextOrder.length > 0 ? [...nextOrder, ...missing] : DEFAULT_ORDER
  } catch {
    return DEFAULT_ORDER
  }
}

function getMetadataIconState(document: Document) {
  const state = getTableMetadataState(document)
  if (state.label === 'Complete') {
    return {
      label: 'Complete',
      Icon: CheckCheck,
      className: 'border-emerald-200 bg-emerald-100 text-black shadow-[0_0_0_2px_rgba(16,185,129,0.12)]',
    }
  }
  if (state.label === 'Missing DOI') {
    return {
      label: 'Missing DOI',
      Icon: Check,
      className: 'border-amber-200 bg-amber-100 text-black shadow-[0_0_0_2px_rgba(245,158,11,0.12)]',
    }
  }
  if (state.label === 'Fetch Possible') {
    return {
      label: 'Fetch Possible',
      Icon: Search,
      className: 'border-sky-200 bg-sky-100 text-black shadow-[0_0_0_2px_rgba(14,165,233,0.12)] hover:bg-sky-200',
    }
  }
  return {
    label: 'Missing',
    Icon: CircleHelp,
    className: 'border-red-200 bg-red-100 text-black shadow-[0_0_0_2px_rgba(239,68,68,0.12)]',
  }
}

function loadStoredColumnWidths() {
  if (typeof window === 'undefined') return DEFAULT_WIDTHS

  try {
    const storedWidths = window.localStorage.getItem(TABLE_WIDTHS_KEY)
    if (!storedWidths) return DEFAULT_WIDTHS
    const parsed = JSON.parse(storedWidths) as Partial<Record<ColumnKey, number>>
    return { ...DEFAULT_WIDTHS, ...parsed }
  } catch {
    return DEFAULT_WIDTHS
  }
}

function emitTableConfigChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(TABLE_CONFIG_EVENT))
}

function persistColumnVisibility(value: Record<ColumnKey, boolean>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TABLE_VISIBILITY_KEY, JSON.stringify(value))
}

function persistColumnOrder(value: ColumnKey[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TABLE_ORDER_KEY, JSON.stringify(value))
}

function getMinimumColumnWidth(column: ColumnDefinition, label: string) {
  const estimatedLabelWidth = Math.ceil(label.length * 7.5)
  return Math.max(column.minWidth, estimatedLabelWidth + 40)
}

export function DocumentTableColumnControls() {
  const t = useT()
  const [columnVisibility, setColumnVisibility] = useState<Record<ColumnKey, boolean>>(DEFAULT_VISIBILITY)
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(DEFAULT_ORDER)

  useEffect(() => {
    const syncFromStorage = () => {
      setColumnVisibility(loadStoredColumnVisibility())
      setColumnOrder(loadStoredColumnOrder())
    }

    syncFromStorage()
    window.addEventListener(TABLE_CONFIG_EVENT, syncFromStorage)

    return () => window.removeEventListener(TABLE_CONFIG_EVENT, syncFromStorage)
  }, [])

  useEffect(() => {
    persistColumnVisibility(columnVisibility)
  }, [columnVisibility])

  useEffect(() => {
    persistColumnOrder(columnOrder)
  }, [columnOrder])

  const visibleColumns = useMemo(
    () => columnOrder
      .map((key) => COLUMN_DEFINITIONS.find((column) => column.key === key))
      .filter((column): column is ColumnDefinition => Boolean(column))
      .filter((column) => columnVisibility[column.key]),
    [columnOrder, columnVisibility],
  )

  const orderedColumns = useMemo(
    () => columnOrder
      .map((key) => COLUMN_DEFINITIONS.find((column) => column.key === key))
      .filter((column): column is ColumnDefinition => Boolean(column)),
    [columnOrder],
  )

  const setColumnVisible = (key: ColumnKey, visible: boolean) => {
    if (!visible && visibleColumns.length <= 1) return
    setColumnVisibility((current) => ({
      ...current,
      [key]: visible,
    }))
    const nextVisibility = {
      ...columnVisibility,
      [key]: visible,
    }
    persistColumnVisibility(nextVisibility)
    emitTableConfigChanged()
  }

  const moveColumn = (key: ColumnKey, direction: 'up' | 'down') => {
    const index = columnOrder.indexOf(key)
    if (index === -1) return
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= columnOrder.length) return
    const nextOrder = [...columnOrder]
    ;[nextOrder[index], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[index]]

    setColumnOrder(nextOrder)
    persistColumnOrder(nextOrder)
    emitTableConfigChanged()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-full">
          <Settings2 className="mr-2 h-4 w-4" />
          {t('documentTable.columns')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{t('documentTable.visibleColumns')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {COLUMN_DEFINITIONS.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.key}
            checked={columnVisibility[column.key]}
            disabled={!column.hideable}
            onCheckedChange={(checked) => setColumnVisible(column.key, Boolean(checked))}
          >
            {t(`documentTable.${column.label}`)}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('documentTable.columnOrder')}</DropdownMenuLabel>
        <div className="space-y-1 p-1">
          {orderedColumns.map((column, index) => (
            <div key={column.key} className="flex items-center justify-between rounded-md px-2 py-1 text-sm">
              <span className="truncate">{t(`documentTable.${column.label}`)}</span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-7 w-7 rounded-full"
                  disabled={index === 0}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    moveColumn(column.key, 'up')
                  }}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-7 w-7 rounded-full"
                  disabled={index === orderedColumns.length - 1}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    moveColumn(column.key, 'down')
                  }}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DocumentTable({ documents, ephemeralFlagsById = {} }: DocumentTableProps) {
  const t = useT()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { locale } = useLocale()
  const minimumColumnWidths = useMemo(
    () => Object.fromEntries(
      COLUMN_DEFINITIONS.map((column) => [
        column.key,
        getMinimumColumnWidth(column, translate(locale, `documentTable.${column.label}`)),
      ]),
    ) as Record<ColumnKey, number>,
    [locale],
  )

  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(() => {
    const storedWidths = loadStoredColumnWidths()
    return Object.fromEntries(
      COLUMN_DEFINITIONS.map((column) => [
        column.key,
        Math.max(storedWidths[column.key], minimumColumnWidths[column.key]),
      ]),
    ) as Record<ColumnKey, number>
  })
  const [columnVisibility, setColumnVisibility] = useState<Record<ColumnKey, boolean>>(() => loadStoredColumnVisibility())
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(() => loadStoredColumnOrder())
  const [resizingColumn, setResizingColumn] = useState<{ key: ColumnKey; startX: number; startWidth: number } | null>(null)
  const [quickEdit, setQuickEdit] = useState<{ documentId: string; field: QuickEditField; value: string } | null>(null)
  const [contextQuickEdit, setContextQuickEdit] = useState<{ documentId: string; field: QuickEditField } | null>(null)
  const { toggleFavorite, updateDocument } = useDocumentActions()
  const selection = useDocumentListSelection(documents.map((document) => document.id))

  useEffect(() => {
    const syncFromStorage = () => {
      const storedWidths = loadStoredColumnWidths()
      setColumnWidths(
        Object.fromEntries(
          COLUMN_DEFINITIONS.map((column) => [
            column.key,
            Math.max(storedWidths[column.key], minimumColumnWidths[column.key]),
          ]),
        ) as Record<ColumnKey, number>,
      )
      setColumnVisibility(loadStoredColumnVisibility())
      setColumnOrder(loadStoredColumnOrder())
    }

    window.addEventListener(TABLE_CONFIG_EVENT, syncFromStorage)

    return () => window.removeEventListener(TABLE_CONFIG_EVENT, syncFromStorage)
  }, [minimumColumnWidths])

  useEffect(() => {
    window.localStorage.setItem(TABLE_WIDTHS_KEY, JSON.stringify(columnWidths))
  }, [columnWidths])

  useEffect(() => {
    window.localStorage.setItem(TABLE_VISIBILITY_KEY, JSON.stringify(columnVisibility))
  }, [columnVisibility])

  useEffect(() => {
    window.localStorage.setItem(TABLE_ORDER_KEY, JSON.stringify(columnOrder))
  }, [columnOrder])

  useEffect(() => {
    if (!resizingColumn) return

    const handlePointerMove = (event: MouseEvent) => {
      const definition = COLUMN_DEFINITIONS.find((column) => column.key === resizingColumn.key)
      if (!definition) return

      const nextWidth = Math.max(
        minimumColumnWidths[definition.key],
        resizingColumn.startWidth + event.clientX - resizingColumn.startX,
      )
      setColumnWidths((current) => ({
        ...current,
        [resizingColumn.key]: nextWidth,
      }))
    }

    const handlePointerUp = () => {
      setResizingColumn(null)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)

    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [minimumColumnWidths, resizingColumn])

  const visibleColumns = useMemo(
    () => columnOrder
      .map((key) => COLUMN_DEFINITIONS.find((column) => column.key === key))
      .filter((column): column is ColumnDefinition => Boolean(column))
      .filter((column) => columnVisibility[column.key]),
    [columnOrder, columnVisibility],
  )

  const beginResize = (key: ColumnKey, event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setResizingColumn({
      key,
      startX: event.clientX,
      startWidth: columnWidths[key],
    })
  }

  const handleRowClick = (id: string, event: React.MouseEvent<HTMLTableRowElement>) => {
    const target = event.target
    if (target instanceof HTMLElement && target.closest(SELECTION_IGNORE_SELECTOR)) {
      return
    }

    selection.selectWithModifiers(id, {
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
    })
  }

  const handleCheckboxClick = (id: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()

    if (event.shiftKey) {
      selection.selectWithModifiers(id, { shiftKey: true })
      return
    }

    selection.toggleSelection(id)
  }

  const handleSelectAllChange = (checked: CheckedState) => {
    if (checked) {
      if (!selection.isAllSelected) {
        selection.toggleAll()
      }
      return
    }

    selection.clearSelection()
  }

  const getOpenHref = (document: Document) =>
    document.documentType === 'my_work'
      ? `/documents?id=${document.id}`
      : document.documentType === 'physical_book'
        ? `/books/notes?id=${document.id}`
        : `/reader/view?id=${document.id}`

  const startQuickEdit = (doc: Document, field: QuickEditField) => {
    const value = field === 'title'
      ? doc.title
      : field === 'authors'
        ? doc.authors.join(', ')
        : doc.year ? String(doc.year) : ''

    setQuickEdit({ documentId: doc.id, field, value })
  }

  const cancelQuickEdit = () => setQuickEdit(null)

  const saveQuickEdit = async () => {
    if (!quickEdit) return
    const value = quickEdit.value.trim()
    const documentId = quickEdit.documentId
    const field = quickEdit.field

    if (field === 'title') {
      if (!value) return
      setQuickEdit(null)
      await updateDocument(documentId, { title: value })
      return
    }

    if (field === 'authors') {
      setQuickEdit(null)
      await updateDocument(documentId, {
        authors: value
          .split(',')
          .map((author) => author.trim())
          .filter(Boolean),
      })
      return
    }

    const parsedYear = value ? Number.parseInt(value, 10) : undefined
    if (value && (!Number.isFinite(parsedYear) || (parsedYear ?? 0) < 0)) return
    setQuickEdit(null)
    await updateDocument(documentId, { year: parsedYear })
  }

  const renderQuickEditInput = (className?: string) => (
    <Input
      data-selection-ignore="true"
      autoFocus
      value={quickEdit?.value ?? ''}
      onChange={(event) => setQuickEdit((current) => current ? { ...current, value: event.target.value } : current)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') {
          event.preventDefault()
          void saveQuickEdit()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          cancelQuickEdit()
        }
      }}
      onBlur={() => void saveQuickEdit()}
      className={cn('h-8 rounded-lg px-2.5 text-sm', className)}
    />
  )

  const quickEditLabel = (field: QuickEditField) => {
    if (field === 'title') return t('documentTable.editTitle')
    if (field === 'authors') return t('documentTable.editAuthors')
    return t('documentTable.editYear')
  }

  const renderQuickEditMenu = (
    doc: Document,
    field: QuickEditField,
    children: ReactNode,
  ) => (
    <div
      data-selection-ignore="true"
      data-quick-edit-field={field}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={() => setContextQuickEdit({ documentId: doc.id, field })}
      onDoubleClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        startQuickEdit(doc, field)
      }}
      className="min-w-0"
    >
      {children}
    </div>
  )

  const getMetadataIconLabel = (label: string) => {
    if (label === 'Complete') return t('common.complete')
    if (label === 'Missing DOI') return t('libraries.missingDoi')
    if (label === 'Fetch Possible') return t('documentTable.fetchPossible')
    return t('common.missing')
  }

  const renderMetadataIconBadge = (doc: Document) => {
    const metadataState = getMetadataIconState(doc)
    const Icon = metadataState.Icon
    const label = getMetadataIconLabel(metadataState.label)
    const badge = (
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full border',
          metadataState.className,
        )}
        title={label}
        aria-label={label}
      >
        <Icon className="h-3 w-3 stroke-[2.5]" />
      </span>
    )

    if (metadataState.label === 'Complete') {
      return badge
    }

    const returnTo = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
    const href = metadataState.label === 'Fetch Possible'
      ? `/documents?id=${doc.id}&metadata=doi&autoSearchMetadata=1&returnTo=${encodeURIComponent(returnTo)}`
      : `/documents?id=${doc.id}&returnTo=${encodeURIComponent(returnTo)}`

    return (
      <Link
        href={href}
        className="rounded-full transition-transform hover:scale-110"
        data-selection-ignore="true"
        title={label}
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
      >
        {badge}
      </Link>
    )
  }

  const renderResizeHandle = (key: ColumnKey) => (
    <div
      role="presentation"
      onMouseDown={(event) => beginResize(key, event)}
      className="absolute right-0 top-0 z-20 h-full w-4 translate-x-1/2 cursor-col-resize select-none touch-none"
    />
  )

  const renderDocumentCell = (doc: Document, column: ColumnDefinition, ephemeralFlags?: DocumentEphemeralUiFlags) => {
    switch (column.key) {
      case 'favorite':
        return (
          <TableCell key={column.key}>
            <div className="flex items-center justify-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => toggleFavorite(doc.id)}
                className={cn(
                  'h-5 w-5 rounded-full p-0 transition-colors',
                  doc.favorite ? 'bg-amber-100 text-amber-500 hover:bg-amber-100 hover:text-amber-500' : 'text-muted-foreground/30 hover:bg-amber-50 hover:text-amber-400',
                )}
                title={t('documentTable.favorite')}
                aria-label={t('documentTable.favorite')}
              >
                <Star className="h-3.5 w-3.5" fill={doc.favorite ? 'currentColor' : 'none'} />
              </Button>
              {renderMetadataIconBadge(doc)}
            </div>
          </TableCell>
        )
      case 'title':
        return (
          <TableCell key={column.key}>
            {quickEdit?.documentId === doc.id && quickEdit.field === 'title' ? (
              <div className="flex items-center gap-2">
                {doc.documentType === 'physical_book'
                  ? <BookMarked className="h-4 w-4 shrink-0 text-muted-foreground" />
                  : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
                {renderQuickEditInput()}
              </div>
            ) : renderQuickEditMenu(
              doc,
              'title',
              <Link href={getOpenHref(doc)} className="group/link flex items-start gap-2">
                {doc.documentType === 'physical_book'
                  ? <BookMarked className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  : <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                <div className="min-w-0">
                  <div className="flex items-start gap-2">
                    <span className="block min-w-0 truncate font-medium text-foreground transition-colors group-hover/link:text-primary">
                      {doc.title}
                    </span>
                    {ephemeralFlags?.isNewlyAdded && <NewBadge />}
                  </div>
                </div>
              </Link>,
            )}
          </TableCell>
        )
      case 'authors':
        return (
          <TableCell key={column.key}>
            {quickEdit?.documentId === doc.id && quickEdit.field === 'authors'
              ? renderQuickEditInput()
              : renderQuickEditMenu(
                doc,
                'authors',
                <span className="block truncate text-sm text-muted-foreground">
                  {doc.authors.slice(0, 2).join(', ') || '—'}
                  {doc.authors.length > 2 && ' et al.'}
                </span>,
              )}
          </TableCell>
        )
      case 'tags':
        return (
          <TableCell key={column.key}>
            {doc.tags.length > 0 ? (
              <div className="flex max-h-10 min-w-0 flex-wrap content-start gap-1 overflow-hidden">
                {doc.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="h-4 min-w-0 max-w-full shrink-0 justify-start overflow-hidden px-2 py-0 text-[10px] leading-none"
                  >
                    <span className="truncate">{tag}</span>
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </TableCell>
        )
      case 'year':
        return (
          <TableCell key={column.key} className="text-center">
            {quickEdit?.documentId === doc.id && quickEdit.field === 'year'
              ? renderQuickEditInput('text-center')
              : renderQuickEditMenu(
                doc,
                'year',
                (
            <span className="text-sm">{doc.year || '—'}</span>
                ),
              )}
          </TableCell>
        )
      case 'status':
        return (
          <TableCell key={column.key}>
            <div className="flex flex-col gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    data-selection-ignore="true"
                    className="w-fit rounded-full"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <ReadingStageBadge stage={doc.readingStage} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" onClick={(event) => event.stopPropagation()}>
                  <DropdownMenuLabel>{t('documentTable.readingStatus')}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup
                    value={doc.readingStage}
                    onValueChange={(value) => void updateDocument(doc.id, { readingStage: value as ReadingStage })}
                  >
                    {READING_STAGE_OPTIONS.map((stage) => (
                      <DropdownMenuRadioItem key={stage.value} value={stage.value}>
                        {stage.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </TableCell>
        )
      case 'comments':
        return (
          <TableCell key={column.key} className="text-center">
            <div className="flex items-center justify-center gap-2">
              <Button asChild variant="outline" size="icon-sm" className="rounded-full">
                <Link href={`/comments?id=${doc.id}`}>
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span className="sr-only">{t('documentTable.openComments')}</span>
                </Link>
              </Button>
              <span className="text-sm text-muted-foreground">
                {t('documentTable.notes', { count: doc.notesCount })}
              </span>
            </div>
          </TableCell>
        )
      case 'rating':
        return (
          <TableCell key={column.key}>
            <StarRating rating={doc.rating} onChange={(rating) => updateDocument(doc.id, { rating })} />
          </TableCell>
        )
      default:
        return null
    }
  }

  return (
    <div className="min-w-0 rounded-2xl bg-card/85 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
      {selection.hasSelection ? (
        <div className="px-4 py-3">
          <DocumentBulkActions
            selectedDocumentIds={selection.selectedDocumentIds}
            onClearSelection={selection.clearSelection}
          />
        </div>
      ) : null}

      <Table className="table-fixed">
        <colgroup>
          <col style={{ width: 48 }} />
          {visibleColumns.map((column) => (
            <col key={column.key} style={{ width: columnWidths[column.key] }} />
          ))}
          <col style={{ width: 56 }} />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={selection.isAllSelected || (selection.isPartiallySelected ? 'indeterminate' : false)}
                onCheckedChange={handleSelectAllChange}
              />
            </TableHead>
            {visibleColumns.map((column) => {
              const centered = column.key === 'year' || column.key === 'comments'
              return (
                <TableHead
                  key={column.key}
                  className={cn(
                    'relative overflow-visible border-r border-border/70 last:border-r-0',
                    centered && 'text-center',
                  )}
                >
                  <span className="block truncate pr-2">{t(`documentTable.${column.label}`)}</span>
                  {renderResizeHandle(column.key)}
                </TableHead>
              )
            })}
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc) => {
            const ephemeralFlags = ephemeralFlagsById[doc.id]

            return (
              <DocumentContextMenu
                key={doc.id}
                document={doc}
                prependContextItems={
                  contextQuickEdit?.documentId === doc.id
                    ? (
                        <ContextMenuItem onSelect={() => startQuickEdit(doc, contextQuickEdit.field)}>
                          {quickEditLabel(contextQuickEdit.field)}
                        </ContextMenuItem>
                      )
                    : null
                }
              >
                <TableRow
                  data-state={selection.isSelected(doc.id) ? 'selected' : undefined}
                  className={cn(
                    'group cursor-pointer',
                    ephemeralFlags?.isNewlyAdded && 'bg-emerald-500/[0.06] hover:bg-emerald-500/[0.08]',
                  )}
                  onClick={(event) => handleRowClick(doc.id, event)}
                  onContextMenu={(event) => {
                    const target = event.target instanceof Element ? event.target : null
                    if (!target?.closest('[data-quick-edit-field]')) {
                      setContextQuickEdit(null)
                    }
                  }}
                >
                  <TableCell>
                    <Checkbox
                      checked={selection.isSelected(doc.id)}
                      onCheckedChange={() => undefined}
                      onClick={(event) => handleCheckboxClick(doc.id, event)}
                    />
                  </TableCell>
                  {visibleColumns.map((column) => renderDocumentCell(doc, column, ephemeralFlags))}

                  <TableCell>
                    <DocumentActions
                      document={doc}
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              </DocumentContextMenu>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
