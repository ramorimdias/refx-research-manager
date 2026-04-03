import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

const repoRoot = process.cwd()
const tauriConfigPath = resolve(repoRoot, 'src-tauri', 'tauri.conf.json')
const releaseAssetsDir = resolve(repoRoot, 'release-assets')
const windowsAssetsDir = join(releaseAssetsDir, 'windows')
const macosAssetsDir = join(releaseAssetsDir, 'macos')
const outputPath = join(releaseAssetsDir, 'latest.json')

function walk(dir) {
  if (!existsSync(dir)) return []

  const entries = readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = join(dir, entry.name)
    return entry.isDirectory() ? walk(fullPath) : [fullPath]
  })
}

function normalizeRepoReleaseBase(endpoint, version) {
  const match = endpoint.match(/^(https:\/\/github\.com\/[^/]+\/[^/]+)\/releases\/latest\/download\/latest\.json$/)
  if (!match) {
    throw new Error(`Unsupported updater endpoint format: ${endpoint}`)
  }

  return `${match[1]}/releases/download/v${version}`
}

function findWindowsManifest() {
  const manifestPath = walk(windowsAssetsDir).find((filePath) => basename(filePath) === 'latest.json')
  if (!manifestPath) return {}

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  return manifest.platforms ?? {}
}

function inferMacPlatformKey() {
  const dmgNames = walk(macosAssetsDir).map((filePath) => basename(filePath).toLowerCase())

  if (dmgNames.some((name) => name.includes('aarch64') || name.includes('arm64'))) {
    return 'darwin-aarch64'
  }

  if (dmgNames.some((name) => name.includes('x86_64') || name.includes('x64'))) {
    return 'darwin-x86_64'
  }

  throw new Error('Could not infer macOS updater architecture from release assets.')
}

function findMacUpdaterEntry(releaseBase) {
  const files = walk(macosAssetsDir)
  const tarballPath = files.find((filePath) => filePath.endsWith('.app.tar.gz'))
  if (!tarballPath) return {}

  const signaturePath = `${tarballPath}.sig`
  if (!existsSync(signaturePath)) {
    throw new Error(`Missing updater signature for ${basename(tarballPath)}`)
  }

  const platformKey = inferMacPlatformKey()

  return {
    [platformKey]: {
      signature: readFileSync(signaturePath, 'utf8').trim(),
      url: `${releaseBase}/${encodeURIComponent(basename(tarballPath))}`,
    },
  }
}

const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'))
const version = tauriConfig.version
const endpoint = tauriConfig.plugins?.updater?.endpoints?.[0]

if (!version || !endpoint) {
  throw new Error('Missing version or updater endpoint in tauri.conf.json')
}

const releaseBase = normalizeRepoReleaseBase(endpoint, version)
const manifest = {
  version,
  notes: `Refx ${version} is available.`,
  pub_date: new Date().toISOString(),
  platforms: {
    ...findWindowsManifest(),
    ...findMacUpdaterEntry(releaseBase),
  },
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`)

console.log(`Generated combined updater manifest at ${outputPath}`)
console.log(JSON.stringify(manifest, null, 2))
