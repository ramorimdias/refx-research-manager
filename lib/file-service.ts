/**
 * File Service for Tauri Desktop App
 * Handles PDF imports, file operations, and document management
 */

import {
  isTauri,
  openFileDialog,
  saveFileDialog,
  copyFile,
  removeFile,
  exists,
  createDir,
  readBinaryFile,
  writeBinaryFile,
  getAppDataDir,
  joinPath,
  openPath,
} from './tauri-api'
import { createDocument } from './db-client'
import type { Document } from './types'

// File service state
let appDataPath: string | null = null
let pdfsPath: string | null = null
let thumbnailsPath: string | null = null
let exportsPath: string | null = null

/**
 * Initialize file service with app data directory
 */
export async function initFileService(): Promise<boolean> {
  if (!isTauri()) {
    console.log('Not running in Tauri environment')
    return false
  }

  try {
    appDataPath = await getAppDataDir()
    pdfsPath = await joinPath(appDataPath, 'pdfs')
    thumbnailsPath = await joinPath(appDataPath, 'thumbnails')
    exportsPath = await joinPath(appDataPath, 'exports')

    // Ensure directories exist
    await createDir(pdfsPath, { recursive: true })
    await createDir(thumbnailsPath, { recursive: true })
    await createDir(exportsPath, { recursive: true })

    return true
  } catch (error) {
    console.error('Failed to initialize file service:', error)
    return false
  }
}

/**
 * Import a PDF file into the library
 */
export async function importPdfFile(): Promise<Document | null> {
  if (!isTauri() || !pdfsPath) {
    console.error('File service not initialized')
    return null
  }

  try {
    // Open file picker
    const selectedFile = await openFileDialog({
      multiple: false,
      filters: [
        { name: 'PDF Documents', extensions: ['pdf'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      title: 'Import PDF Document',
    })

    if (!selectedFile || Array.isArray(selectedFile)) {
      return null
    }

    // Generate document ID and destination path
    const docId = `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const fileName = selectedFile.split(/[\\/]/).pop() || 'document.pdf'
    const destPath = await joinPath(pdfsPath, `${docId}.pdf`)

    // Copy file to app data
    await copyFile(selectedFile, destPath)

    // Extract basic metadata (in a real app, you'd parse the PDF)
    const title = fileName.replace('.pdf', '').replace(/[-_]/g, ' ')

    // Create document in database
    const document = await createDocument({
      id: docId,
      title: title,
      authors: [],
      filePath: destPath,
      fileName: fileName,
      readingStage: 'unread',
      tags: ['To Read'],
    })

    return document
  } catch (error) {
    console.error('Failed to import PDF:', error)
    return null
  }
}

/**
 * Import multiple PDF files
 */
export async function importMultiplePdfFiles(): Promise<Document[]> {
  if (!isTauri() || !pdfsPath) {
    console.error('File service not initialized')
    return []
  }

  try {
    const selectedFiles = await openFileDialog({
      multiple: true,
      filters: [
        { name: 'PDF Documents', extensions: ['pdf'] },
      ],
      title: 'Import PDF Documents',
    })

    if (!selectedFiles) return []

    const files = Array.isArray(selectedFiles) ? selectedFiles : [selectedFiles]
    const documents: Document[] = []

    for (const filePath of files) {
      const docId = `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const fileName = filePath.split(/[\\/]/).pop() || 'document.pdf'
      const destPath = await joinPath(pdfsPath, `${docId}.pdf`)

      await copyFile(filePath, destPath)

      const title = fileName.replace('.pdf', '').replace(/[-_]/g, ' ')
      const document = await createDocument({
        id: docId,
        title: title,
        authors: [],
        filePath: destPath,
        fileName: fileName,
        readingStage: 'unread',
        tags: ['To Read'],
      })

      if (document) {
        documents.push(document)
      }
    }

    return documents
  } catch (error) {
    console.error('Failed to import PDFs:', error)
    return []
  }
}

/**
 * Get the local file path for a document's PDF
 */
export async function getDocumentPdfPath(documentId: string): Promise<string | null> {
  if (!pdfsPath) return null

  const pdfPath = await joinPath(pdfsPath, `${documentId}.pdf`)
  const fileExists = await exists(pdfPath)

  return fileExists ? pdfPath : null
}

/**
 * Read PDF file as binary data
 */
export async function readPdfFile(documentId: string): Promise<Uint8Array | null> {
  const pdfPath = await getDocumentPdfPath(documentId)
  if (!pdfPath) return null

  try {
    return await readBinaryFile(pdfPath)
  } catch (error) {
    console.error('Failed to read PDF file:', error)
    return null
  }
}

/**
 * Delete a document's PDF file
 */
export async function deleteDocumentFile(documentId: string): Promise<boolean> {
  if (!pdfsPath || !thumbnailsPath) return false

  try {
    const pdfPath = await joinPath(pdfsPath, `${documentId}.pdf`)
    const thumbPath = await joinPath(thumbnailsPath, `${documentId}.png`)

    if (await exists(pdfPath)) {
      await removeFile(pdfPath)
    }

    if (await exists(thumbPath)) {
      await removeFile(thumbPath)
    }

    return true
  } catch (error) {
    console.error('Failed to delete document files:', error)
    return false
  }
}

/**
 * Export document to a user-selected location
 */
export async function exportDocument(documentId: string, fileName: string): Promise<boolean> {
  if (!pdfsPath) return false

  try {
    const sourcePath = await joinPath(pdfsPath, `${documentId}.pdf`)
    if (!(await exists(sourcePath))) {
      console.error('Source file does not exist')
      return false
    }

    const destPath = await saveFileDialog({
      filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
      defaultPath: fileName,
      title: 'Export PDF Document',
    })

    if (!destPath) return false

    await copyFile(sourcePath, destPath)
    return true
  } catch (error) {
    console.error('Failed to export document:', error)
    return false
  }
}

/**
 * Open PDF file with system default application
 */
export async function openPdfExternal(documentId: string): Promise<boolean> {
  const pdfPath = await getDocumentPdfPath(documentId)
  if (!pdfPath) return false

  try {
    await openPath(pdfPath)
    return true
  } catch (error) {
    console.error('Failed to open PDF externally:', error)
    return false
  }
}

/**
 * Export annotations as text file
 */
export async function exportAnnotationsAsText(
  documentTitle: string,
  annotations: Array<{ type: string; content?: string; pageNumber: number; quote?: string }>
): Promise<boolean> {
  if (!isTauri()) return false

  try {
    const destPath = await saveFileDialog({
      filters: [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'Markdown Files', extensions: ['md'] },
      ],
      defaultPath: `${documentTitle.replace(/[^a-z0-9]/gi, '_')}_annotations.txt`,
      title: 'Export Annotations',
    })

    if (!destPath) return false

    let content = `# Annotations for "${documentTitle}"\n\n`
    content += `Exported on: ${new Date().toLocaleDateString()}\n\n`
    content += `---\n\n`

    for (const ann of annotations) {
      content += `## Page ${ann.pageNumber} (${ann.type})\n\n`
      if (ann.quote) {
        content += `> ${ann.quote}\n\n`
      }
      if (ann.content) {
        content += `${ann.content}\n\n`
      }
      content += `---\n\n`
    }

    const encoder = new TextEncoder()
    await writeBinaryFile(destPath, encoder.encode(content))

    return true
  } catch (error) {
    console.error('Failed to export annotations:', error)
    return false
  }
}

/**
 * Export library data as JSON backup
 */
export async function exportLibraryBackup(data: {
  documents: Document[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  annotations: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tags: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  notes: any[]
}): Promise<boolean> {
  if (!isTauri()) return false

  try {
    const destPath = await saveFileDialog({
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      defaultPath: `refx_backup_${new Date().toISOString().split('T')[0]}.json`,
      title: 'Export Library Backup',
    })

    if (!destPath) return false

    const backupData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      ...data,
    }

    const encoder = new TextEncoder()
    await writeBinaryFile(destPath, encoder.encode(JSON.stringify(backupData, null, 2)))

    return true
  } catch (error) {
    console.error('Failed to export backup:', error)
    return false
  }
}

/**
 * Get the PDF URL for rendering in the app
 * In Tauri, we use the asset protocol to load local files
 */
export function getPdfUrl(documentId: string): string {
  if (!isTauri()) {
    // Fallback for web/dev mode - use a sample PDF
    return '/sample.pdf'
  }
  // Tauri asset protocol
  return `asset://localhost/${documentId}.pdf`
}

/**
 * Check if file service is available
 */
export function isFileServiceAvailable(): boolean {
  return isTauri() && appDataPath !== null
}
