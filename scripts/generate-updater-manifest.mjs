import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

const repoRoot = process.cwd()
const tauriConfigPath = resolve(repoRoot, 'src-tauri', 'tauri.conf.json')
const bundleDir = resolve(repoRoot, 'src-tauri', 'target', 'release', 'bundle')

function normalizeRepoReleaseBase(endpoint, version) {
  const match = endpoint.match(/^(https:\/\/github\.com\/[^/]+\/[^/]+)\/releases\/latest\/download\/latest\.json$/)
  if (!match) {
    throw new Error(`Unsupported updater endpoint format: ${endpoint}`)
  }

  return `${match[1]}/releases/download/v${version}`
}

function findWindowsArtifact(msiDir, productName, version) {
  if (!existsSync(msiDir)) {
    throw new Error(`Bundle directory not found: ${msiDir}`)
  }

  const prefix = `${productName}_${version}_`
  const installer = readdirSync(msiDir).find((file) => file.startsWith(prefix) && file.endsWith('.msi'))
  if (!installer) {
    throw new Error(`No MSI installer found for ${productName} ${version}`)
  }

  const signatureFile = `${installer}.sig`
  const signaturePath = join(msiDir, signatureFile)
  if (!existsSync(signaturePath)) {
    throw new Error(`Missing updater signature for ${installer}`)
  }

  return {
    installer,
    installerPath: join(msiDir, installer),
    signature: readFileSync(signaturePath, 'utf8').trim(),
  }
}

const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'))
const productName = tauriConfig.productName
const version = tauriConfig.version
const endpoint = tauriConfig.plugins?.updater?.endpoints?.[0]

if (!productName || !version || !endpoint) {
  throw new Error('Missing productName, version, or updater endpoint in tauri.conf.json')
}

const msiDir = join(bundleDir, 'msi')
const artifact = findWindowsArtifact(msiDir, productName, version)
const releaseBase = normalizeRepoReleaseBase(endpoint, version)

const manifest = {
  version,
  notes: `Refx ${version} is available.`,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature: artifact.signature,
      url: `${releaseBase}/${encodeURIComponent(basename(artifact.installerPath))}`,
    },
  },
}

const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`
const manifestTargets = [
  join(bundleDir, 'latest.json'),
  join(msiDir, 'latest.json'),
]

for (const target of manifestTargets) {
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, manifestJson)
}

console.log(`Generated updater manifest:`)
for (const target of manifestTargets) {
  console.log(`- ${target}`)
}
