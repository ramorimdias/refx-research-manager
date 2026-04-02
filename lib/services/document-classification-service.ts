'use client'

import * as repo from '@/lib/repositories/local-db'
import { getDocumentSuggestedTags } from '@/lib/services/document-tag-suggestion-service'
import { getDocumentPlainText } from '@/lib/services/document-text-service'
import type {
  DocumentClassification,
  SemanticClassificationMode,
  SemanticClassificationProvider,
  SuggestedTag,
} from '@/lib/types'

type ClassificationKeyword = {
  phrase: string
  weight: number
}

type ClassificationTopicProfile = {
  category: string
  keywords: ClassificationKeyword[]
  suggestedTags: string[]
  topic: string
}

type ClassificationInput = {
  document: repo.DbDocument
  suggestedTags: SuggestedTag[]
  text: string
}

type ClassificationScore = {
  matchedKeywords: string[]
  profile: ClassificationTopicProfile
  score: number
}

type StoredDocumentClassification = Omit<DocumentClassification, 'classifiedAt'> & {
  classifiedAt: string
}

export type DocumentClassificationResult = {
  classification: DocumentClassification
  documentId: string
  textHash?: string
}

export type IncomingDocumentClassification = {
  category: string
  topic: string
  confidence?: number
  matchedKeywords?: string[]
  suggestedTags?: Array<string | SuggestedTag>
}

export interface DocumentSemanticClassifier {
  id: SemanticClassificationProvider
  label: string
  mode: Exclude<SemanticClassificationMode, 'off'>
  classify(input: ClassificationInput): Promise<DocumentClassification>
}

const TOPIC_PROFILES: ClassificationTopicProfile[] = [
  {
    category: 'Computer Science',
    topic: 'Machine Learning',
    suggestedTags: ['machine learning', 'deep learning', 'neural networks'],
    keywords: [
      { phrase: 'machine learning', weight: 3.6 },
      { phrase: 'deep learning', weight: 4.1 },
      { phrase: 'neural network', weight: 3.8 },
      { phrase: 'representation learning', weight: 2.6 },
      { phrase: 'supervised learning', weight: 2.4 },
      { phrase: 'self supervised', weight: 2.7 },
      { phrase: 'gradient descent', weight: 2.1 },
      { phrase: 'training loss', weight: 1.7 },
    ],
  },
  {
    category: 'Computer Science',
    topic: 'Natural Language Processing',
    suggestedTags: ['natural language processing', 'language models', 'text mining'],
    keywords: [
      { phrase: 'natural language processing', weight: 4.2 },
      { phrase: 'language model', weight: 3.6 },
      { phrase: 'tokenization', weight: 1.9 },
      { phrase: 'named entity recognition', weight: 2.6 },
      { phrase: 'machine translation', weight: 2.8 },
      { phrase: 'text classification', weight: 2.2 },
      { phrase: 'question answering', weight: 2.1 },
      { phrase: 'semantic parsing', weight: 2.2 },
    ],
  },
  {
    category: 'Computer Science',
    topic: 'Information Retrieval',
    suggestedTags: ['information retrieval', 'search', 'ranking'],
    keywords: [
      { phrase: 'information retrieval', weight: 4.2 },
      { phrase: 'search engine', weight: 2.8 },
      { phrase: 'retrieval', weight: 1.8 },
      { phrase: 'relevance ranking', weight: 2.4 },
      { phrase: 'query expansion', weight: 2.0 },
      { phrase: 'document ranking', weight: 2.4 },
      { phrase: 'passage retrieval', weight: 2.2 },
      { phrase: 'bm25', weight: 2.0 },
    ],
  },
  {
    category: 'Computer Science',
    topic: 'Computer Vision',
    suggestedTags: ['computer vision', 'image analysis', 'object detection'],
    keywords: [
      { phrase: 'computer vision', weight: 4.2 },
      { phrase: 'image classification', weight: 2.6 },
      { phrase: 'object detection', weight: 2.9 },
      { phrase: 'segmentation', weight: 2.0 },
      { phrase: 'visual recognition', weight: 2.4 },
      { phrase: 'image synthesis', weight: 2.0 },
      { phrase: 'vision transformer', weight: 2.6 },
      { phrase: 'convolutional neural network', weight: 2.8 },
    ],
  },
  {
    category: 'Computer Science',
    topic: 'Systems and Distributed Computing',
    suggestedTags: ['distributed systems', 'cloud computing', 'performance'],
    keywords: [
      { phrase: 'distributed system', weight: 3.9 },
      { phrase: 'cloud computing', weight: 3.2 },
      { phrase: 'throughput', weight: 1.6 },
      { phrase: 'latency', weight: 1.8 },
      { phrase: 'fault tolerance', weight: 2.2 },
      { phrase: 'replication', weight: 1.9 },
      { phrase: 'consensus', weight: 2.5 },
      { phrase: 'resource scheduling', weight: 2.1 },
    ],
  },
  {
    category: 'Computer Science',
    topic: 'Security and Privacy',
    suggestedTags: ['security', 'privacy', 'cryptography'],
    keywords: [
      { phrase: 'security', weight: 1.6 },
      { phrase: 'privacy', weight: 2.0 },
      { phrase: 'encryption', weight: 2.3 },
      { phrase: 'cryptography', weight: 2.8 },
      { phrase: 'authentication', weight: 1.9 },
      { phrase: 'access control', weight: 2.0 },
      { phrase: 'threat model', weight: 2.1 },
      { phrase: 'differential privacy', weight: 2.9 },
    ],
  },
  {
    category: 'Computer Science',
    topic: 'Software Engineering',
    suggestedTags: ['software engineering', 'program analysis', 'testing'],
    keywords: [
      { phrase: 'software engineering', weight: 3.8 },
      { phrase: 'static analysis', weight: 2.6 },
      { phrase: 'program analysis', weight: 2.9 },
      { phrase: 'unit testing', weight: 2.0 },
      { phrase: 'regression testing', weight: 2.3 },
      { phrase: 'bug prediction', weight: 2.1 },
      { phrase: 'source code', weight: 1.7 },
      { phrase: 'code review', weight: 1.8 },
    ],
  },
  {
    category: 'Statistics and Data Science',
    topic: 'Statistical Data Analysis',
    suggestedTags: ['statistics', 'data analysis', 'regression'],
    keywords: [
      { phrase: 'statistical analysis', weight: 3.6 },
      { phrase: 'regression model', weight: 2.8 },
      { phrase: 'bayesian', weight: 2.4 },
      { phrase: 'hypothesis testing', weight: 2.4 },
      { phrase: 'confidence interval', weight: 2.0 },
      { phrase: 'variance', weight: 1.4 },
      { phrase: 'time series', weight: 2.1 },
      { phrase: 'survival analysis', weight: 2.0 },
    ],
  },
  {
    category: 'Life Sciences',
    topic: 'Bioinformatics and Computational Biology',
    suggestedTags: ['bioinformatics', 'genomics', 'computational biology'],
    keywords: [
      { phrase: 'bioinformatics', weight: 4.0 },
      { phrase: 'genomics', weight: 3.1 },
      { phrase: 'protein', weight: 1.7 },
      { phrase: 'sequence analysis', weight: 2.6 },
      { phrase: 'gene expression', weight: 2.5 },
      { phrase: 'transcriptomics', weight: 2.5 },
      { phrase: 'biological pathway', weight: 2.1 },
      { phrase: 'computational biology', weight: 3.2 },
    ],
  },
  {
    category: 'Mathematics',
    topic: 'Optimization',
    suggestedTags: ['optimization', 'convex optimization', 'mathematical modeling'],
    keywords: [
      { phrase: 'optimization', weight: 2.0 },
      { phrase: 'convex optimization', weight: 3.0 },
      { phrase: 'objective function', weight: 2.0 },
      { phrase: 'lagrangian', weight: 2.2 },
      { phrase: 'constraint', weight: 1.5 },
      { phrase: 'stochastic optimization', weight: 2.5 },
      { phrase: 'integer programming', weight: 2.6 },
      { phrase: 'linear programming', weight: 2.6 },
    ],
  },
]

function normalizeWhitespace(input: string) {
  return input.replace(/\s+/g, ' ').trim()
}

function normalizeTerm(input: string) {
  return normalizeWhitespace(input.toLowerCase().replace(/[^\p{L}\p{N}\s-]+/gu, ' ').replace(/[-_]+/g, ' '))
}

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function countPhraseOccurrences(text: string, phrase: string) {
  const normalized = normalizeTerm(phrase)
  if (!normalized) return 0
  const matches = text.match(new RegExp(`\\b${escapeRegExp(normalized)}\\b`, 'g'))
  return matches?.length ?? 0
}

function pushMatchedKeyword(target: string[], phrase: string) {
  const normalized = normalizeTerm(phrase)
  if (!normalized || target.includes(normalized)) return
  target.push(normalized)
}

function scoreTopicProfile(
  profile: ClassificationTopicProfile,
  text: string,
  title: string,
  abstractText: string,
  tagSignals: string[],
): ClassificationScore {
  const matchedKeywords: string[] = []
  let score = 0

  for (const keyword of profile.keywords) {
    const textHits = Math.min(4, countPhraseOccurrences(text, keyword.phrase))
    if (textHits > 0) {
      score += textHits * keyword.weight
      pushMatchedKeyword(matchedKeywords, keyword.phrase)
    }

    if (title.includes(keyword.phrase)) {
      score += keyword.weight * 1.6
      pushMatchedKeyword(matchedKeywords, keyword.phrase)
    }

    if (abstractText.includes(keyword.phrase)) {
      score += keyword.weight * 0.8
      pushMatchedKeyword(matchedKeywords, keyword.phrase)
    }

    if (tagSignals.some((tag) => tag.includes(keyword.phrase) || keyword.phrase.includes(tag))) {
      score += keyword.weight * 1.2
      pushMatchedKeyword(matchedKeywords, keyword.phrase)
    }
  }

  return {
    matchedKeywords,
    profile,
    score,
  }
}

function buildClassificationConfidence(top: ClassificationScore, second?: ClassificationScore) {
  if (top.score <= 0) return 0.32
  const separation = second ? Math.max(0, top.score - second.score) : top.score * 0.35
  const base = 0.48 + Math.min(0.28, top.score / 42)
  const lift = Math.min(0.2, separation / Math.max(1, top.score + 6))
  return Number(Math.min(0.96, Math.max(0.32, base + lift)).toFixed(2))
}

function buildClassificationSuggestedTags(
  profile: ClassificationTopicProfile,
  matchedKeywords: string[],
  document: repo.DbDocument,
  suggestedTags: SuggestedTag[],
) {
  const existing = new Set(
    [...document.tags, ...suggestedTags.map((entry) => entry.name)]
      .map((tag) => normalizeTerm(tag))
      .filter(Boolean),
  )

  const tagPool = [
    ...profile.suggestedTags,
    ...matchedKeywords.filter((entry) => entry.includes(' ')),
  ]

  const normalizedPool = Array.from(
    new Set(tagPool.map((tag) => normalizeTerm(tag)).filter(Boolean)),
  )

  return normalizedPool
    .filter((tag) => !existing.has(tag))
    .slice(0, 5)
    .map((tag, index) => ({
      name: tag,
      confidence: Number(Math.max(0.45, 0.82 - index * 0.08).toFixed(2)),
    }))
}

function buildFallbackClassification(document: repo.DbDocument, suggestedTags: SuggestedTag[]): DocumentClassification {
  return {
    category: 'General Research',
    topic: document.metadataStatus === 'complete' ? 'Structured Research Document' : 'Unclassified Research',
    confidence: 0.32,
    provider: 'local_heuristic',
    model: 'heuristic-taxonomy-v1',
    classifiedAt: new Date(),
    matchedKeywords: [],
    suggestedTags: suggestedTags.slice(0, 3),
  }
}

const localHeuristicClassifier: DocumentSemanticClassifier = {
  id: 'local_heuristic',
  label: 'Local Heuristic Topic Classifier',
  mode: 'local_heuristic',
  async classify(input) {
    const normalizedText = normalizeTerm(input.text).slice(0, 80_000)
    const normalizedTitle = normalizeTerm(input.document.title)
    const normalizedAbstract = normalizeTerm(input.document.abstractText ?? '')
    const tagSignals = [
      ...input.document.tags.map((tag) => normalizeTerm(tag)),
      ...input.suggestedTags.map((entry) => normalizeTerm(entry.name)),
    ].filter(Boolean)

    const scored = TOPIC_PROFILES
      .map((profile) => scoreTopicProfile(profile, normalizedText, normalizedTitle, normalizedAbstract, tagSignals))
      .sort((left, right) => right.score - left.score)

    const top = scored[0]
    const second = scored[1]

    if (!top || top.score < 2.4) {
      return buildFallbackClassification(input.document, input.suggestedTags)
    }

    return {
      category: top.profile.category,
      topic: top.profile.topic,
      confidence: buildClassificationConfidence(top, second),
      provider: 'local_heuristic',
      model: 'heuristic-taxonomy-v1',
      classifiedAt: new Date(),
      matchedKeywords: top.matchedKeywords.slice(0, 8),
      suggestedTags: buildClassificationSuggestedTags(top.profile, top.matchedKeywords, input.document, input.suggestedTags),
    }
  },
}

const CLASSIFIER_REGISTRY: Record<Exclude<SemanticClassificationMode, 'off'>, DocumentSemanticClassifier> = {
  local_heuristic: localHeuristicClassifier,
}

type ClassificationSource = {
  classification?: DocumentClassification
  classificationResult?: string
}

export function serializeDocumentClassification(classification: DocumentClassification) {
  const stored: StoredDocumentClassification = {
    ...classification,
    classifiedAt: classification.classifiedAt.toISOString(),
  }

  return JSON.stringify(stored)
}

export function parseDocumentClassification(document: ClassificationSource) {
  const value = document.classification ?? document.classificationResult
  if (!value) return undefined
  if (typeof value !== 'string') return value

  let parsed: unknown
  try {
    parsed = JSON.parse(value) as unknown
  } catch {
    return undefined
  }

  if (!parsed || typeof parsed !== 'object') return undefined

  const candidate = parsed as Partial<StoredDocumentClassification>
  if (typeof candidate.category !== 'string' || typeof candidate.topic !== 'string' || typeof candidate.confidence !== 'number') {
    return undefined
  }

  return {
    category: candidate.category,
    topic: candidate.topic,
    confidence: candidate.confidence,
    provider:
      candidate.provider === 'gemini_page1'
      || candidate.provider === 'gemini_full'
      || candidate.provider === 'local_heuristic'
        ? candidate.provider
        : 'local_heuristic',
    model: typeof candidate.model === 'string' ? candidate.model : 'heuristic-taxonomy-v1',
    classifiedAt: candidate.classifiedAt ? new Date(candidate.classifiedAt) : new Date(),
    matchedKeywords: Array.isArray(candidate.matchedKeywords)
      ? candidate.matchedKeywords.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    suggestedTags: Array.isArray(candidate.suggestedTags)
      ? candidate.suggestedTags
          .map((entry) => ({
            name: typeof entry?.name === 'string' ? normalizeTerm(entry.name) : '',
            confidence: typeof entry?.confidence === 'number' ? entry.confidence : undefined,
          }))
          .filter((entry) => entry.name.length > 0)
      : undefined,
  } satisfies DocumentClassification
}

export function coerceIncomingDocumentClassification(
  candidate: IncomingDocumentClassification | null | undefined,
  options: {
    provider: SemanticClassificationProvider
    model: string
  },
): DocumentClassification | null {
  if (!candidate) return null

  const category = normalizeWhitespace(candidate.category ?? '')
  const topic = normalizeWhitespace(candidate.topic ?? '')
  if (!category || !topic) return null

  const confidence = typeof candidate.confidence === 'number'
    ? Number(Math.max(0.2, Math.min(0.99, candidate.confidence)).toFixed(2))
    : 0.72

  const matchedKeywords = Array.isArray(candidate.matchedKeywords)
    ? candidate.matchedKeywords
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => normalizeTerm(entry))
        .filter(Boolean)
        .slice(0, 8)
    : []

  const suggestedTags = Array.isArray(candidate.suggestedTags)
    ? candidate.suggestedTags
        .map((entry) => {
          if (typeof entry === 'string') {
            return { name: normalizeTerm(entry), confidence: undefined }
          }
          if (entry && typeof entry.name === 'string') {
            return {
              name: normalizeTerm(entry.name),
              confidence: typeof entry.confidence === 'number' ? entry.confidence : undefined,
            }
          }
          return null
        })
        .filter((entry): entry is SuggestedTag => !!entry?.name)
        .slice(0, 5)
    : []

  return {
    category,
    topic,
    confidence,
    provider: options.provider,
    model: options.model,
    classifiedAt: new Date(),
    matchedKeywords,
    suggestedTags,
  }
}

function resolveClassifier(mode: SemanticClassificationMode) {
  if (mode === 'off') return null
  return CLASSIFIER_REGISTRY[mode]
}

export async function classifyDocumentSemantics(
  documentId: string,
  options?: {
    mode?: SemanticClassificationMode
  },
): Promise<DocumentClassificationResult> {
  const document = await repo.getDocumentById(documentId)
  if (!document) {
    throw new Error(`Document ${documentId} was not found.`)
  }

  const mode = options?.mode ?? 'local_heuristic'
  const classifier = resolveClassifier(mode)
  if (!classifier) {
    throw new Error('Semantic classification is disabled.')
  }

  const text = normalizeWhitespace(await getDocumentPlainText(document))
  if (!text) {
    throw new Error('Semantic classification requires extracted or OCR text.')
  }

  const classification = await classifier.classify({
    document,
    suggestedTags: getDocumentSuggestedTags(document),
    text,
  })

  const processedAt = new Date().toISOString()
  await repo.updateDocumentMetadata(documentId, {
    classificationResult: serializeDocumentClassification(classification),
    classificationStatus: 'complete',
    classificationTextHash: document.textHash,
    processingUpdatedAt: processedAt,
    lastProcessedAt: processedAt,
  })

  return {
    classification,
    documentId,
    textHash: document.textHash,
  }
}
