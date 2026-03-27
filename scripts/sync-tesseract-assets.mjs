import { copyFileSync, cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = dirname(scriptDir)
const publicTesseractDir = join(repoRoot, 'public', 'tesseract')
const workerTargetDir = join(publicTesseractDir, 'worker')
const coreTargetDir = join(publicTesseractDir, 'core')
const langTargetDir = join(publicTesseractDir, 'lang', 'eng', '4.0.0_best_int')

function resetDirectory(path) {
  rmSync(path, { force: true, recursive: true })
  mkdirSync(path, { recursive: true })
}

function packageDir(packageName, paths = [repoRoot]) {
  return dirname(require.resolve(`${packageName}/package.json`, { paths }))
}

function syncWorkerAssets() {
  const tesseractDir = packageDir('tesseract.js')
  resetDirectory(workerTargetDir)
  copyFileSync(join(tesseractDir, 'dist', 'worker.min.js'), join(workerTargetDir, 'worker.min.js'))
}

function syncCoreAssets() {
  const coreDir = packageDir('tesseract.js-core', [packageDir('tesseract.js')])
  resetDirectory(coreTargetDir)

  for (const entry of readdirSync(coreDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    if (!/^tesseract-core.*\.(js|wasm)$/.test(entry.name)) continue
    copyFileSync(join(coreDir, entry.name), join(coreTargetDir, entry.name))
  }
}

function syncLanguageAssets() {
  const langDir = packageDir('@tesseract.js-data/eng')
  resetDirectory(langTargetDir)
  cpSync(join(langDir, '4.0.0_best_int'), langTargetDir, { recursive: true })
}

resetDirectory(publicTesseractDir)
syncWorkerAssets()
syncCoreAssets()
syncLanguageAssets()

console.log(`Synced local Tesseract assets into ${basename(publicTesseractDir)}/`)
