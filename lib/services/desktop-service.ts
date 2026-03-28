'use client'

import { isTauri, open } from '@/lib/tauri/client'
import { loadAppSettings } from '@/lib/app-settings'
import * as repo from '@/lib/repositories/local-db'
import { ingestImportedPdfDocument } from '@/lib/services/document-ingestion-service'
import { normalizeErrorMessage } from '@/lib/utils/error'

export async function bootstrapDesktop() {
  await repo.initializeDatabase()
  const libraries = await repo.listLibraries()
  return libraries
}

export async function importPdfs(libraryId: string, sourcePaths?: string[]) {
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
  for (const src of files) {
    const result = await ingestImportedPdfDocument(
      { libraryId, sourcePath: src },
      {
        enableOcrFallback: settings.autoOcr,
        enableOnlineMetadataEnrichment: settings.autoOnlineMetadataEnrichment,
        enableSemanticClassification: settings.advancedClassificationMode !== 'off',
        semanticClassificationMode: settings.advancedClassificationMode,
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
  }

  return imported
}

export function canUseDesktopFeatures() {
  return isTauri()
}
