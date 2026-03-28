'use client'

type ErrorRecord = Record<string, unknown>

function isErrorRecord(value: unknown): value is ErrorRecord {
  return typeof value === 'object' && value !== null
}

function readNestedMessage(value: unknown): string | null {
  if (!isErrorRecord(value)) return null

  const directMessage = value.message
  if (typeof directMessage === 'string' && directMessage.trim()) {
    return directMessage
  }

  const nestedErrorMessage = readNestedMessage(value.error)
  if (nestedErrorMessage) return nestedErrorMessage

  const causeMessage = readNestedMessage(value.cause)
  if (causeMessage) return causeMessage

  return null
}

export function normalizeErrorMessage(error: unknown, fallback = 'Unknown error') {
  if (error instanceof Error) {
    return error.message || fallback
  }

  if (typeof error === 'string') {
    return error || fallback
  }

  const nestedMessage = readNestedMessage(error)
  if (nestedMessage) {
    return nestedMessage
  }

  if (isErrorRecord(error)) {
    const detail = Object.entries(error)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        if (typeof value === 'string') return `${key}: ${value}`
        if (typeof value === 'number' || typeof value === 'boolean') return `${key}: ${String(value)}`
        return null
      })
      .filter((value): value is string => Boolean(value))
      .join(', ')

    return detail || fallback
  }

  return String(error || fallback)
}

export function serializeErrorForLogging(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  if (isErrorRecord(error)) {
    return error
  }

  return { value: normalizeErrorMessage(error) }
}
