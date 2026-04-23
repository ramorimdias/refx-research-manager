'use client'

import { readFile } from '@tauri-apps/plugin-fs'
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js'
import * as repo from '@/lib/repositories/local-db'
import { loadPdfJsModule } from '@/lib/services/document-processing'
import {
  persistDocumentTextVariant,
  readPersistedDocumentText,
  type PersistedDocumentTextPage,
  type PersistedDocumentTextVariant,
} from '@/lib/services/document-text-service'

export type DocumentOcrResult = {
  activeSource: 'ocr' | 'native'
  documentId: string
  extractedAt: string
  extractedTextPath: string
  hasOcrText: boolean
  pageCount: number
  text: string
  textHash: string
}

const OCR_RENDER_SCALE = 2

let ocrOperation = Promise.resolve()
let ocrWorkerPromise: Promise<Worker> | null = null

function normalizeText(input?: string | null) {
  return (input ?? '').trim()
}

function withOcrLock<T>(operation: () => Promise<T>) {
  const next = ocrOperation.then(operation, operation)
  ocrOperation = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

function toPublicAssetUrl(path: string) {
  if (typeof window === 'undefined') {
    throw new Error('OCR is only available in the desktop renderer.')
  }

  return new URL(path, window.location.origin).toString()
}

async function yieldToBrowser() {
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
    const worker = await createWorker(
      'eng',
      OEM.LSTM_ONLY,
      {
        cachePath: 'refx-ocr',
        corePath: toPublicAssetUrl('/tesseract/core'),
        langPath: toPublicAssetUrl('/tesseract/lang/eng/4.0.0_best_int'),
        logger: () => undefined,
        workerPath: toPublicAssetUrl('/tesseract/worker/worker.min.js'),
      },
    )

      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: '1',
      } as never)

      return worker
    })().catch((error) => {
      ocrWorkerPromise = null
      throw error
    })
  }

  return ocrWorkerPromise
}

async function renderPdfPageToCanvas(
  pdfPage: {
    getViewport: (args: { scale: number }) => { width: number; height: number }
    render: (args: {
      canvasContext: CanvasRenderingContext2D
      viewport: { width: number; height: number }
    }) => { promise: Promise<void>; cancel?: () => void }
    cleanup?: () => void
  },
) {
  const viewport = pdfPage.getViewport({ scale: OCR_RENDER_SCALE })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(viewport.width))
  canvas.height = Math.max(1, Math.ceil(viewport.height))

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Unable to initialize an OCR canvas context.')
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)

  const renderTask = pdfPage.render({
    canvasContext: context,
    viewport,
  })

  await renderTask.promise
  pdfPage.cleanup?.()

  return canvas
}

async function extractPdfOcrText(filePath: string) {
  const pdfjs = await loadPdfJsModule()
  const worker = await getOcrWorker()
  const bytes = await readFile(filePath)
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
    stopAtErrors: false,
  })

  const pdf = (await loadingTask.promise) as {
    numPages: number
    getPage: (pageNumber: number) => Promise<{
      getViewport: (args: { scale: number }) => { width: number; height: number }
      render: (args: {
        canvasContext: CanvasRenderingContext2D
        viewport: { width: number; height: number }
      }) => { promise: Promise<void>; cancel?: () => void }
      cleanup?: () => void
    }>
    destroy?: () => Promise<void>
  }

  try {
    const pages: PersistedDocumentTextPage[] = []
    let weightedConfidence = 0
    let confidenceWeight = 0

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const canvas = await renderPdfPageToCanvas(page)
      try {
        const result = await worker.recognize(canvas)
        const pageText = normalizeText(result.data.text)
        const pageConfidence = typeof result.data.confidence === 'number' ? result.data.confidence : undefined
        pages.push({
          pageNumber,
          text: pageText,
        })

        if (typeof pageConfidence === 'number') {
          const weight = Math.max(pageText.length, 1)
          weightedConfidence += pageConfidence * weight
          confidenceWeight += weight
        }
      } finally {
        canvas.width = 0
        canvas.height = 0
      }

      await yieldToBrowser()
    }

    const text = normalizeText(
      pages
        .map((page) => page.text)
        .filter(Boolean)
        .join('\n\n'),
    )

    return {
      confidence: confidenceWeight > 0 ? Number((weightedConfidence / confidenceWeight).toFixed(2)) : undefined,
      pageCount: pdf.numPages,
      pages,
      text,
    }
  } finally {
    await pdf.destroy?.()
  }
}

export async function runDocumentOcr(documentId: string): Promise<DocumentOcrResult> {
  return withOcrLock(async () => {
    const document = await repo.getDocumentById(documentId)
    if (!document) {
      throw new Error(`Document ${documentId} was not found.`)
    }

    const filePath = document.importedFilePath ?? document.sourcePath
    if (!filePath) {
      throw new Error(`Document ${documentId} does not have an imported file path.`)
    }

    const extractedAt = new Date().toISOString()
    const existing = await readPersistedDocumentText(document)
    const extracted = await extractPdfOcrText(filePath)
    const variant: PersistedDocumentTextVariant = {
      confidence: extracted.confidence,
      extractedAt,
      pageCount: extracted.pageCount,
      pages: extracted.pages,
      text: extracted.text,
    }
    const { filePath: extractedTextPath, persisted } = await persistDocumentTextVariant(
      documentId,
      'ocr',
      variant,
      existing,
      document.extractedTextPath,
    )
    const hasExtractedText = normalizeText(persisted.native?.text).length > 0
    const hasOcrText = normalizeText(persisted.ocr?.text).length > 0
    const textHash = await sha256Hex(persisted.text)

    const updated = await repo.updateDocumentMetadata(documentId, {
      extractedTextPath,
      hasExtractedText,
      hasOcr: hasOcrText,
      hasOcrText,
      indexingStatus: 'pending',
      ocrStatus: hasOcrText ? 'complete' : 'failed',
      pageCount: persisted.pageCount,
      processingError: hasOcrText ? '' : 'OCR did not produce usable text.',
      processingUpdatedAt: extractedAt,
      lastProcessedAt: extractedAt,
      searchText: persisted.text,
      textExtractedAt: persisted.extractedAt,
      textHash,
    })

    if (!updated) {
      throw new Error(`Document ${documentId} could not be updated after OCR.`)
    }

    return {
      activeSource: persisted.activeSource,
      documentId,
      extractedAt: persisted.extractedAt,
      extractedTextPath,
      hasOcrText,
      pageCount: persisted.pageCount,
      text: persisted.text,
      textHash,
    }
  })
}
