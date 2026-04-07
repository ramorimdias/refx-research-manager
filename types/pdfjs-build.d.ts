declare module '/pdfjs/pdf.js' {
  export const GlobalWorkerOptions: {
    workerSrc: string
  }

  export function getDocument(source: Record<string, unknown>): {
    promise: Promise<unknown>
    destroy?: () => void
  }
}

declare module 'pdfjs-dist/build/pdf.mjs' {
  export const GlobalWorkerOptions: {
    workerSrc: string
  }

  export function getDocument(source: Record<string, unknown>): {
    promise: Promise<unknown>
    destroy?: () => void
  }
}
