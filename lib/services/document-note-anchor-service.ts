export type NoteAreaRect = {
  x: number
  y: number
  width: number
  height: number
}

type SerializedAreaNoteAnchor = {
  kind: 'area_highlight'
  rect: NoteAreaRect
  color?: string
}

type SerializedPointNoteAnchor = {
  kind: 'point_note'
  color?: string
}

type SerializedNoteAnchor = SerializedAreaNoteAnchor | SerializedPointNoteAnchor

function parseSerializedNoteAnchor(locationHint?: string | null): SerializedNoteAnchor | null {
  if (!locationHint) return null

  try {
    return JSON.parse(locationHint) as SerializedNoteAnchor
  } catch {
    return null
  }
}

export function parseAreaNoteAnchor(locationHint?: string | null): NoteAreaRect | null {
  const parsed = parseSerializedNoteAnchor(locationHint)
  if (
    parsed?.kind !== 'area_highlight'
    || typeof parsed.rect?.x !== 'number'
    || typeof parsed.rect?.y !== 'number'
    || typeof parsed.rect?.width !== 'number'
    || typeof parsed.rect?.height !== 'number'
  ) {
    return null
  }

  return parsed.rect
}

export function parseNoteAnchorColor(locationHint?: string | null): string | null {
  const parsed = parseSerializedNoteAnchor(locationHint)
  return typeof parsed?.color === 'string' && parsed.color.trim() ? parsed.color.trim() : null
}

export function serializeAreaNoteAnchor(rect: NoteAreaRect, color?: string) {
  return JSON.stringify({
    kind: 'area_highlight',
    rect,
    color,
  } satisfies SerializedAreaNoteAnchor)
}

export function serializePointNoteAnchor(color?: string) {
  return JSON.stringify({
    kind: 'point_note',
    color,
  } satisfies SerializedPointNoteAnchor)
}

export function getNoteLocationLabel(locationHint?: string | null) {
  if (!locationHint) return ''
  const parsed = parseSerializedNoteAnchor(locationHint)
  if (parsed?.kind === 'area_highlight') return 'Highlighted area'
  if (parsed?.kind === 'point_note') return 'Pinned note'
  return locationHint
}
