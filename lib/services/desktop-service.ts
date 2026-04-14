'use client'

import { isTauri, open, readFile, stat } from '@/lib/tauri/client'
import { loadAppSettings } from '@/lib/app-settings'
import * as repo from '@/lib/repositories/local-db'
import { suspendRemoteVaultSyncDuringBatch } from '@/lib/remote-storage-state'
import { ingestImportedPdfDocument } from '@/lib/services/document-ingestion-service'
import { normalizeErrorMessage } from '@/lib/utils/error'
import type { DocumentProcessingStageState } from '@/lib/types'

export type ImportProgressUpdate = {
  current: number
  total: number
  currentFile: string
  stage?: DocumentProcessingStageState['stage']
  status?: DocumentProcessingStageState['status']
  detail?: string
  error?: string
}

export type ImportSkipReason =
  | 'duplicate_in_selection'
  | 'same_hash_existing'
  | 'same_path_existing'
  | 'same_name_size_existing'

export type ImportSkippedDocument = {
  sourcePath: string
  fileName: string
  reason: ImportSkipReason
  existingDocumentId?: string
  existingDocumentTitle?: string
}

export type ImportDocumentsResult = {
  imported: repo.DbDocument[]
  skipped: ImportSkippedDocument[]
}

type SourceFingerprint = {
  fileHash?: string
  fileName: string
  fileSize?: number
  normalizedName: string
  normalizedPath: string
}

function normalizeImportPath(filePath: string) {
  return filePath.replace(/\\/g, '/').trim().toLowerCase()
}

function fileNameFromPath(filePath: string) {
  return filePath.split(/[\\/]/).pop() ?? filePath
}

function normalizeFileName(fileName: string) {
  return fileName.trim().toLowerCase()
}

function buildNameAndSizeKey(fileName: string, fileSize?: number) {
  if (!Number.isFinite(fileSize)) return null
  return `${normalizeFileName(fileName)}::${fileSize}`
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

async function inspectSourceFingerprint(sourcePath: string): Promise<SourceFingerprint> {
  const fileName = fileNameFromPath(sourcePath)
  const normalizedPath = normalizeImportPath(sourcePath)
  const normalizedName = normalizeFileName(fileName)

  let fileSize: number | undefined
  try {
    const metadata = await stat(sourcePath)
    fileSize = typeof metadata.size === 'number' ? metadata.size : undefined
  } catch (error) {
    console.warn(`Could not read file size for "${sourcePath}":`, error)
  }

  let fileHash: string | undefined
  try {
    const bytes = await readFile(sourcePath)
    fileHash = await sha256Hex(bytes)
  } catch (error) {
    console.warn(`Could not fingerprint "${sourcePath}" for duplicate detection:`, error)
  }

  return {
    fileHash,
    fileName,
    fileSize,
    normalizedName,
    normalizedPath,
  }
}

export async function bootstrapDesktop() {
  const libraries = await repo.listLibraries()
  return libraries
}

export async function importPdfs(
  libraryId: string,
  sourcePaths?: string[],
  onProgress?: (update: ImportProgressUpdate) => void,
) {
  const selected =
    sourcePaths && sourcePaths.length > 0
      ? sourcePaths
      : await open({
          multiple: true,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
          title: 'Import PDF files',
        })

  if (!selected) return { imported: [], skipped: [] } satisfies ImportDocumentsResult
  const files = Array.isArray(selected) ? selected : [selected]
  const settings = await loadAppSettings(true)
  const existingDocuments = await repo.listDocumentsByLibrary(libraryId)

  const imported: repo.DbDocument[] = []
  const skipped: ImportSkippedDocument[] = []
  const resumeRemoteSync = suspendRemoteVaultSyncDuringBatch()
  const existingByPath = new Map<string, repo.DbDocument>()
  const existingByHash = new Map<string, repo.DbDocument>()
  const existingByNameAndSize = new Map<string, repo.DbDocument>()
  const pendingImportPaths = new Set<string>()
  const pendingImportHashes = new Set<string>()
  const pendingImportNameAndSize = new Set<string>()

  for (const document of existingDocuments) {
    if (document.sourcePath) {
      existingByPath.set(normalizeImportPath(document.sourcePath), document)
    }
    if (document.fileHash) {
      existingByHash.set(document.fileHash, document)
    }
    const fileName = fileNameFromPath(document.sourcePath ?? document.importedFilePath ?? document.title)
    const nameAndSizeKey = buildNameAndSizeKey(fileName, document.fileSize)
    if (nameAndSizeKey) {
      existingByNameAndSize.set(nameAndSizeKey, document)
    }
  }

  try {
    for (const [index, src] of files.entries()) {
      onProgress?.({
        current: index + 1,
        total: files.length,
        currentFile: src,
        detail: 'Starting import...',
      })

      const fingerprint = await inspectSourceFingerprint(src)
      const pathDuplicate = existingByPath.get(fingerprint.normalizedPath)
      if (pathDuplicate) {
      skipped.push({
        sourcePath: src,
        fileName: fingerprint.fileName,
        reason: 'same_path_existing',
        existingDocumentId: pathDuplicate.id,
        existingDocumentTitle: pathDuplicate.title,
      })
      onProgress?.({
        current: index + 1,
        total: files.length,
        currentFile: src,
        detail: 'Skipped duplicate document already linked to this library.',
        status: 'skipped',
      })
        continue
      }

      if (pendingImportPaths.has(fingerprint.normalizedPath)) {
      skipped.push({
        sourcePath: src,
        fileName: fingerprint.fileName,
        reason: 'duplicate_in_selection',
      })
      onProgress?.({
        current: index + 1,
        total: files.length,
        currentFile: src,
        detail: 'Skipped duplicate document selected more than once.',
        status: 'skipped',
      })
        continue
      }

      if (fingerprint.fileHash) {
        const existingHashDuplicate = existingByHash.get(fingerprint.fileHash)
        if (existingHashDuplicate) {
        skipped.push({
          sourcePath: src,
          fileName: fingerprint.fileName,
          reason: 'same_hash_existing',
          existingDocumentId: existingHashDuplicate.id,
          existingDocumentTitle: existingHashDuplicate.title,
        })
        onProgress?.({
          current: index + 1,
          total: files.length,
          currentFile: src,
          detail: 'Skipped duplicate document already stored in this library.',
          status: 'skipped',
        })
          continue
        }

        if (pendingImportHashes.has(fingerprint.fileHash)) {
        skipped.push({
          sourcePath: src,
          fileName: fingerprint.fileName,
          reason: 'duplicate_in_selection',
        })
        onProgress?.({
          current: index + 1,
          total: files.length,
          currentFile: src,
          detail: 'Skipped duplicate document selected more than once.',
          status: 'skipped',
        })
          continue
        }
      }

      const nameAndSizeKey = buildNameAndSizeKey(fingerprint.fileName, fingerprint.fileSize)
      if (nameAndSizeKey) {
        const existingNameAndSizeDuplicate = existingByNameAndSize.get(nameAndSizeKey)
        if (existingNameAndSizeDuplicate) {
        skipped.push({
          sourcePath: src,
          fileName: fingerprint.fileName,
          reason: 'same_name_size_existing',
          existingDocumentId: existingNameAndSizeDuplicate.id,
          existingDocumentTitle: existingNameAndSizeDuplicate.title,
        })
        onProgress?.({
          current: index + 1,
          total: files.length,
          currentFile: src,
          detail: 'Skipped document with the same filename and file size already in this library.',
          status: 'skipped',
        })
          continue
        }

        if (pendingImportNameAndSize.has(nameAndSizeKey)) {
        skipped.push({
          sourcePath: src,
          fileName: fingerprint.fileName,
          reason: 'duplicate_in_selection',
        })
        onProgress?.({
          current: index + 1,
          total: files.length,
          currentFile: src,
          detail: 'Skipped duplicate document selected more than once.',
          status: 'skipped',
        })
          continue
        }
      }

      pendingImportPaths.add(fingerprint.normalizedPath)
      if (fingerprint.fileHash) {
        pendingImportHashes.add(fingerprint.fileHash)
      }
      if (nameAndSizeKey) {
        pendingImportNameAndSize.add(nameAndSizeKey)
      }

      let acceptStageUpdates = true
      const result = await ingestImportedPdfDocument(
      {
        libraryId,
        sourcePath: src,
        fileHash: fingerprint.fileHash,
        fileSize: fingerprint.fileSize,
      },
      {
        enableOcrFallback: settings.autoOcr,
        enableKeywordExtraction: settings.autoKeywordExtractionOnImport,
        enableOnlineMetadataEnrichment: settings.autoOnlineMetadataEnrichment,
        enableSemanticClassification: settings.advancedClassificationMode !== 'off',
        semanticClassificationMode: settings.advancedClassificationMode,
        onStageUpdate: (stage) => {
          if (!acceptStageUpdates) return
          onProgress?.({
            current: index + 1,
            total: files.length,
            currentFile: src,
            stage: stage.stage,
            status: stage.status,
            detail: stage.detail,
            error: stage.error,
          })
        },
      },
    ).catch((error) => ({
      document: null,
      stages: [],
      success: false,
      error: normalizeErrorMessage(error, `Failed to import ${src}`),
    }))
      acceptStageUpdates = false

      const failedStageError = Array.isArray(result.stages)
      ? result.stages.find((stage) => stage.status === 'failed')?.error
      : undefined
      const importError = result.error ?? failedStageError

      if (!result.success) {
      console.error(
        `Document ingestion failed for "${src}": ${importError ?? 'Unknown import error'}`,
      )
      }
      if (result.document) {
      imported.push(result.document)
      existingByPath.set(fingerprint.normalizedPath, result.document)
      if (result.document.fileHash) {
        existingByHash.set(result.document.fileHash, result.document)
      }
      const resultNameAndSizeKey = buildNameAndSizeKey(
        fileNameFromPath(result.document.sourcePath ?? result.document.importedFilePath ?? fingerprint.fileName),
        result.document.fileSize ?? fingerprint.fileSize,
      )
      if (resultNameAndSizeKey) {
        existingByNameAndSize.set(resultNameAndSizeKey, result.document)
      }
      }

      onProgress?.({
      current: index + 1,
      total: files.length,
      currentFile: src,
      detail: result.success ? 'Import complete.' : importError ?? 'Import failed.',
      status: result.success ? 'completed' : 'failed',
        error: result.success ? undefined : importError,
      })
    }
  } finally {
    resumeRemoteSync()
  }

  return { imported, skipped } satisfies ImportDocumentsResult
}

export function canUseDesktopFeatures() {
  return isTauri()
}
