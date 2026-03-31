import type { DbNote } from '@/lib/repositories/local-db'
import { parseAreaNoteAnchor, parseNoteAnchorColor } from '@/lib/services/document-note-anchor-service'

export type PositionedComment = DbNote & {
  commentNumber: number
  positionX?: number
  positionY?: number
  color?: string
  areaRect?: {
    x: number
    y: number
    width: number
    height: number
  }
}

export function buildDocumentCommentTitle(commentNumber: number) {
  return `Note ${commentNumber}`
}

export function sortDocumentComments<T extends DbNote>(comments: T[]) {
  return [...comments].sort((left, right) => {
    const leftNumber = left.commentNumber ?? Number.MAX_SAFE_INTEGER
    const rightNumber = right.commentNumber ?? Number.MAX_SAFE_INTEGER
    if (leftNumber !== rightNumber) {
      return leftNumber - rightNumber
    }

    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  })
}

export function getDocumentComments(notes: DbNote[], documentId: string) {
  return sortDocumentComments(
    notes.filter((note) => note.documentId === documentId && typeof note.commentNumber === 'number'),
  )
}

export function getDocumentPageComments(notes: DbNote[], documentId: string, pageNumber: number) {
  return getDocumentComments(notes, documentId)
    .filter((note) => note.pageNumber === pageNumber)
    .map((note) => ({
      ...note,
      color: parseNoteAnchorColor(note.locationHint) ?? undefined,
      areaRect: parseAreaNoteAnchor(note.locationHint) ?? undefined,
    }))
}

export function getNextDocumentCommentNumber(notes: DbNote[], documentId: string) {
  return getDocumentComments(notes, documentId).reduce((max, note) => {
    return Math.max(max, note.commentNumber ?? 0)
  }, 0) + 1
}
