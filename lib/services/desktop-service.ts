'use client'

import { isTauri, open } from '@/lib/tauri/client'
import { loadAppSettings } from '@/lib/app-settings'
import * as repo from '@/lib/repositories/local-db'
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

  if (!selected) return []
  const files = Array.isArray(selected) ? selected : [selected]
  const settings = await loadAppSettings(true)

  const imported: repo.DbDocument[] = []
  for (const [index, src] of files.entries()) {
    onProgress?.({
      current: index + 1,
      total: files.length,
      currentFile: src,
      detail: 'Starting import...',
    })

    const result = await ingestImportedPdfDocument(
      { libraryId, sourcePath: src },
      {
        enableOcrFallback: settings.autoOcr,
        enableKeywordExtraction: settings.autoKeywordExtractionOnImport,
        enableOnlineMetadataEnrichment: settings.autoOnlineMetadataEnrichment,
        enableSemanticClassification: settings.advancedClassificationMode !== 'off',
        semanticClassificationMode: settings.advancedClassificationMode,
        onStageUpdate: (stage) => {
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

  return imported
}

export function canUseDesktopFeatures() {
  return isTauri()
}
