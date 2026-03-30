'use client'

import * as repo from '@/lib/repositories/local-db'
import { getDocumentPlainText } from '@/lib/services/document-text-service'

const DOI_PATTERN = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi

function normalizeDoi(input: string) {
  return input
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[.,;:)\]}"]+$/g, '')
    .toLowerCase()
}

function isCompleteDoi(input: string) {
  const normalized = normalizeDoi(input)
  const slashIndex = normalized.indexOf('/')
  if (slashIndex <= 0) return false

  const prefix = normalized.slice(0, slashIndex)
  const suffix = normalized.slice(slashIndex + 1)

  if (!/^10\.\d{4,9}$/i.test(prefix)) return false
  if (suffix.length < 6) return false
  if (!/[a-z0-9]$/i.test(suffix)) return false
  if (!/[a-z]/i.test(suffix) && !/\d{3,}/.test(suffix)) return false

  return true
}

export async function scanDocumentForDoiReferences(
  document: Pick<repo.DbDocument, 'id' | 'doi' | 'extractedTextPath' | 'searchText'>,
) {
  const text = await getDocumentPlainText(document)
  if (!text.trim()) {
    return [] as string[]
  }

  const ownDoi = normalizeDoi(document.doi ?? '')
  const found = new Set<string>()

  for (const match of text.matchAll(DOI_PATTERN)) {
    const normalized = normalizeDoi(match[0] ?? '')
    if (!normalized || normalized === ownDoi || !isCompleteDoi(normalized)) continue
    found.add(normalized)
  }

  return Array.from(found)
}
