export const LIBRARY_COLOR_OPTIONS = [
  '#2563eb',
  '#4338ca',
  '#0f766e',
  '#16a34a',
  '#ea580c',
  '#dc2626',
  '#93c5fd',
  '#c4b5fd',
  '#99f6e4',
  '#86efac',
  '#fdba74',
  '#fca5a5',
] as const

function hexToRgb(color: string) {
  const normalized = color.trim().replace('#', '')
  const expanded = normalized.length === 3
    ? normalized.split('').map((part) => `${part}${part}`).join('')
    : normalized

  if (expanded.length !== 6) {
    return null
  }

  const value = Number.parseInt(expanded, 16)
  if (Number.isNaN(value)) {
    return null
  }

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

export function getLibraryForegroundColor(color?: string | null) {
  const rgb = color ? hexToRgb(color) : null
  if (!rgb) return '#ffffff'

  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255
  return luminance > 0.62 ? '#0f172a' : '#ffffff'
}

export function getLibraryOverlayColor(color?: string | null) {
  return getLibraryForegroundColor(color) === '#ffffff'
    ? 'rgba(255, 255, 255, 0.18)'
    : 'rgba(15, 23, 42, 0.10)'
}
