import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const packageJsonPath = join(repoRoot, 'package.json')
const tauriConfigPath = join(repoRoot, 'src-tauri', 'tauri.conf.json')
const cargoTomlPath = join(repoRoot, 'src-tauri', 'Cargo.toml')
const appVersionPath = join(repoRoot, 'lib', 'app-version.ts')
const bundleDir = join(repoRoot, 'src-tauri', 'target', 'release', 'bundle')
const msiDir = join(bundleDir, 'msi')
const envLocalPath = join(repoRoot, '.env.local')

const nextVersion = process.argv[2]?.trim()

if (!nextVersion) {
  console.error('Usage: pnpm release <version>')
  process.exit(1)
}

const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/

if (!semverPattern.test(nextVersion)) {
  console.error(`Invalid version "${nextVersion}". Use semver like 0.1.1 or 1.0.0-beta.1`)
  process.exit(1)
}

function run(command, args, options = {}) {
  const spawnOptions = {
    cwd: repoRoot,
    stdio: 'inherit',
    ...options,
  }

  const isWindowsCmd = process.platform === 'win32' && command.toLowerCase().endsWith('.cmd')
  const result = isWindowsCmd
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', command, ...args], spawnOptions)
    : spawnSync(command, args, spawnOptions)

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1)
  }
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  if ((result.status ?? 1) !== 0) {
    process.stderr.write(result.stderr || '')
    process.exit(result.status ?? 1)
  }

  return (result.stdout || '').trim()
}

function loadLocalEnvFile(filePath) {
  if (!existsSync(filePath)) return

  const source = readFileSync(filePath, 'utf8')
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) continue

    const key = line.slice(0, separatorIndex).trim()
    if (!key || process.env[key]?.trim()) continue

    let value = line.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    process.env[key] = value
  }
}

function parseGithubRepoFullName(remoteUrl) {
  const normalized = remoteUrl.trim()
  const httpsMatch = normalized.match(/^https:\/\/github\.com\/([^/]+\/[^/.]+?)(?:\.git)?$/i)
  if (httpsMatch) return httpsMatch[1]

  const sshMatch = normalized.match(/^git@github\.com:([^/]+\/[^/.]+?)(?:\.git)?$/i)
  if (sshMatch) return sshMatch[1]

  return null
}

function findReleaseAssets(version, productName) {
  if (!existsSync(msiDir)) {
    console.error(`Release aborted: bundle directory not found: ${msiDir}`)
    process.exit(1)
  }

  const installerPrefix = `${productName}_${version}_`
  const installerName = capture('powershell', [
    '-NoProfile',
    '-Command',
    `Get-ChildItem -Path '${msiDir.replace(/'/g, "''")}' -Filter '${installerPrefix}*.msi' | Sort-Object Name | Select-Object -Last 1 -ExpandProperty Name`,
  ])

  if (!installerName) {
    console.error(`Release aborted: could not find MSI installer for ${productName} ${version}`)
    process.exit(1)
  }

  const installerPath = join(msiDir, installerName)
  const signaturePath = `${installerPath}.sig`
  const latestManifestPath = join(msiDir, 'latest.json')

  for (const filePath of [installerPath, signaturePath, latestManifestPath]) {
    if (!existsSync(filePath)) {
      console.error(`Release aborted: missing release asset: ${filePath}`)
      process.exit(1)
    }
  }

  return [
    { name: installerName, path: installerPath, contentType: 'application/x-msi' },
    { name: `${installerName}.sig`, path: signaturePath, contentType: 'application/octet-stream' },
    { name: 'latest.json', path: latestManifestPath, contentType: 'application/json' },
  ]
}

async function githubRequest(url, { token, method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...headers,
    },
    body,
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`GitHub API request failed (${response.status} ${response.statusText}): ${details}`)
  }

  if (response.status === 204) return null
  return response.json()
}

async function createOrUpdateGithubRelease({
  token,
  repoFullName,
  tagName,
  releaseName,
  releaseNotes,
  assets,
}) {
  let release = null

  try {
    release = await githubRequest(`https://api.github.com/repos/${repoFullName}/releases/tags/${tagName}`, {
      token,
    })
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('(404')) {
      throw error
    }
  }

  if (!release) {
    release = await githubRequest(`https://api.github.com/repos/${repoFullName}/releases`, {
      token,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: tagName,
        name: releaseName,
        body: releaseNotes,
        draft: false,
        prerelease: false,
      }),
    })
  } else {
    release = await githubRequest(`https://api.github.com/repos/${repoFullName}/releases/${release.id}`, {
      token,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: releaseName,
        body: releaseNotes,
        draft: false,
        prerelease: false,
      }),
    })
  }

  const existingAssets = Array.isArray(release.assets) ? release.assets : []
  for (const asset of existingAssets) {
    if (assets.some((candidate) => candidate.name === asset.name)) {
      await githubRequest(`https://api.github.com/repos/${repoFullName}/releases/assets/${asset.id}`, {
        token,
        method: 'DELETE',
      })
    }
  }

  const uploadBase = release.upload_url.replace(/\{.*$/, '')
  for (const asset of assets) {
    const fileBuffer = readFileSync(asset.path)
    const uploadUrl = `${uploadBase}?name=${encodeURIComponent(asset.name)}`
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': asset.contentType,
        'Content-Length': String(fileBuffer.length),
      },
      body: fileBuffer,
    })

    if (!uploadResponse.ok) {
      const details = await uploadResponse.text()
      throw new Error(`GitHub asset upload failed for ${asset.name} (${uploadResponse.status} ${uploadResponse.statusText}): ${details}`)
    }
  }
}

const status = capture('git', ['status', '--porcelain'])
if (status) {
  console.error('Release aborted: git working tree is not clean.')
  console.error('Commit or stash your current changes first, then run the release command again.')
  process.exit(1)
}

const existingTag = capture('git', ['tag', '--list', `v${nextVersion}`])
if (existingTag) {
  console.error(`Release aborted: tag v${nextVersion} already exists.`)
  process.exit(1)
}

const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
const originUrl = capture('git', ['remote', 'get-url', 'origin'])
const repoFullName = parseGithubRepoFullName(originUrl)
loadLocalEnvFile(envLocalPath)
const githubToken = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim()

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'))
const cargoToml = readFileSync(cargoTomlPath, 'utf8')
const appVersionSource = readFileSync(appVersionPath, 'utf8')

const currentPackageVersion = packageJson.version
const currentTauriVersion = tauriConfig.version
const cargoVersionMatch = cargoToml.match(/^version = "([^"]+)"$/m)
const currentCargoVersion = cargoVersionMatch?.[1]
const appVersionMatch = appVersionSource.match(/APP_VERSION = '([^']+)'/)
const currentAppVersion = appVersionMatch?.[1]

if (!currentCargoVersion || !currentAppVersion) {
  console.error('Release aborted: could not find version in one of the release-managed files')
  process.exit(1)
}

packageJson.version = nextVersion
tauriConfig.version = nextVersion
const nextCargoToml = cargoToml.replace(/^version = "([^"]+)"$/m, `version = "${nextVersion}"`)
const nextAppVersionSource = appVersionSource.replace(/APP_VERSION = '([^']+)'/, `APP_VERSION = '${nextVersion}'`)

writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)
writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`)
writeFileSync(cargoTomlPath, nextCargoToml)
writeFileSync(appVersionPath, nextAppVersionSource)

console.log(`Updated REFX version to ${nextVersion}`)
console.log(`- package.json: ${currentPackageVersion} -> ${packageJson.version}`)
console.log(`- src-tauri/tauri.conf.json: ${currentTauriVersion} -> ${tauriConfig.version}`)
console.log(`- src-tauri/Cargo.toml: ${currentCargoVersion} -> ${nextVersion}`)
console.log(`- lib/app-version.ts: ${currentAppVersion} -> ${nextVersion}`)
console.log('')
console.log('Building signed release...')

run('pnpm.cmd', ['tauri:build'])

const releaseAssets = findReleaseAssets(nextVersion, tauriConfig.productName)

console.log('')
run('git', ['add', 'package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'lib/app-version.ts'])

const stagedVersionChanges = capture('git', ['diff', '--cached', '--name-only'])
if (stagedVersionChanges) {
  console.log('Creating git release commit...')
  run('git', ['commit', '-m', `Release v${nextVersion}`])
} else {
  console.log('No version file changes to commit; continuing with tag and push.')
}

run('git', ['tag', `v${nextVersion}`])
run('git', ['push', 'origin', branch, '--tags'])

if (!repoFullName) {
  console.error('Release aborted: could not determine the GitHub repository from origin remote.')
  process.exit(1)
}

if (!githubToken) {
  console.error('Release aborted: GITHUB_TOKEN (or GH_TOKEN) is required to create the GitHub Release and upload assets.')
  process.exit(1)
}

console.log('')
console.log('Creating GitHub release and uploading assets...')

await createOrUpdateGithubRelease({
  token: githubToken,
  repoFullName,
  tagName: `v${nextVersion}`,
  releaseName: `v${nextVersion}`,
  releaseNotes: `Refx ${nextVersion} release.`,
  assets: releaseAssets,
})

console.log('')
console.log(`Release v${nextVersion} completed, pushed on branch ${branch}, and published on GitHub.`)
