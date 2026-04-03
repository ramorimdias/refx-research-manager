'use client'

import * as repo from '@/lib/repositories/local-db'
import type { Document, DocumentRelation, DocumentRelationStatus } from '@/lib/types'
import {
  buildLibraryIndex,
  dedupeCitationMatches,
  matchParsedReferenceToDocument,
} from '@/lib/services/document-citation-matching-service'
import { extractDocumentReferenceSection } from '@/lib/services/document-reference-extraction-service'
import { parseDocumentReferences } from '@/lib/services/document-reference-parser-service'

const AUTO_CONFIRM_THRESHOLD = 0.86
const PROPOSED_THRESHOLD = 0.62

function toUiRelation(relation: repo.DbDocumentRelation): DocumentRelation {
  const parseWarnings = (() => {
    if (!relation.parseWarnings) return undefined
    try {
      return JSON.parse(relation.parseWarnings) as string[]
    } catch {
      return undefined
    }
  })()

  return {
    id: relation.id,
    sourceDocumentId: relation.sourceDocumentId,
    targetDocumentId: relation.targetDocumentId,
    linkType: relation.linkType as DocumentRelation['linkType'],
    linkOrigin: relation.linkOrigin as DocumentRelation['linkOrigin'],
    relationStatus: relation.relationStatus as DocumentRelationStatus | undefined,
    confidence: relation.confidence,
    label: relation.label,
    notes: relation.notes,
    matchMethod: relation.matchMethod as DocumentRelation['matchMethod'],
    rawReferenceText: relation.rawReferenceText,
    normalizedReferenceText: relation.normalizedReferenceText,
    normalizedTitle: relation.normalizedTitle,
    normalizedFirstAuthor: relation.normalizedFirstAuthor,
    referenceIndex: relation.referenceIndex,
    parseConfidence: relation.parseConfidence,
    parseWarnings,
    matchDebugInfo: relation.matchDebugInfo,
    createdAt: new Date(relation.createdAt),
    updatedAt: new Date(relation.updatedAt),
  }
}

function buildCitationStatus(confidence: number): DocumentRelationStatus | null {
  if (confidence >= AUTO_CONFIRM_THRESHOLD) return 'auto_confirmed'
  if (confidence >= PROPOSED_THRESHOLD) return 'proposed'
  return null
}

function buildCitationLabel(status: DocumentRelationStatus) {
  return status === 'proposed' ? 'Proposed citation' : 'Citation'
}

function buildCitationNotes(matchMethod: string, confidence: number, status: DocumentRelationStatus) {
  const formattedMethod = matchMethod.replace(/_/g, ' ')
  const leading = status === 'proposed' ? 'Proposed by' : 'Matched by'
  return `${leading} ${formattedMethod} at ${Math.round(confidence * 100)}% confidence.`
}

async function createCitationRelationsForDocument(
  sourceDocument: Document,
  libraryDocuments: Document[],
) {
  const referenceSection = await extractDocumentReferenceSection({
    id: sourceDocument.id,
    extractedTextPath: sourceDocument.extractedTextPath,
    searchText: sourceDocument.searchText,
  })

  if (!referenceSection || referenceSection.entries.length === 0) {
    return [] as DocumentRelation[]
  }

  const parsedReferences = parseDocumentReferences(referenceSection.entries, sourceDocument.id)
  const libraryIndex = buildLibraryIndex(libraryDocuments)
  const rawMatches = parsedReferences
    .map((reference) => matchParsedReferenceToDocument(sourceDocument, reference, libraryDocuments, libraryIndex))
    .filter((match): match is NonNullable<typeof match> => Boolean(match))

  const matches = dedupeCitationMatches(rawMatches)
  const createdRelations: DocumentRelation[] = []

  for (const match of matches) {
    const relationStatus = buildCitationStatus(match.confidence)
    if (!relationStatus) continue

    const created = await repo.createRelation({
      sourceDocumentId: sourceDocument.id,
      targetDocumentId: match.targetDocument.id,
      linkType: 'citation',
      linkOrigin: 'auto',
      relationStatus,
      confidence: match.confidence,
      label: buildCitationLabel(relationStatus),
      notes: buildCitationNotes(match.matchMethod, match.confidence, relationStatus),
      matchMethod: match.matchMethod,
      rawReferenceText: match.parsedReference.rawReferenceText,
      normalizedReferenceText: match.parsedReference.normalizedReferenceText,
      normalizedTitle: match.parsedReference.normalizedTitle,
      normalizedFirstAuthor: match.parsedReference.normalizedFirstAuthor,
      referenceIndex: match.parsedReference.referenceIndex,
      parseConfidence: match.parsedReference.parseConfidence,
      parseWarnings: JSON.stringify(match.parsedReference.parseWarnings),
      matchDebugInfo: match.debugInfo,
    })

    createdRelations.push(toUiRelation(created))
  }

  return createdRelations
}

export async function rebuildCitationRelationsForDocument(
  sourceDocument: Document,
  libraryDocuments: Document[],
) {
  await repo.rebuildAutoCitationRelationsForDocument(sourceDocument.id)
  return createCitationRelationsForDocument(sourceDocument, libraryDocuments)
}

export async function rebuildCitationRelationsForLibrary(
  libraryId: string,
  libraryDocuments: Document[],
) {
  await repo.rebuildAutoCitationRelations(libraryId)

  const createdRelations: DocumentRelation[] = []
  for (const sourceDocument of libraryDocuments) {
    createdRelations.push(...await createCitationRelationsForDocument(sourceDocument, libraryDocuments))
  }

  return createdRelations
}
