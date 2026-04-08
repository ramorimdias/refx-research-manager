import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const updaterKeyPath = resolve(repoRoot, '.tauri', 'refx-updater.key')
const forwardedBuildArgs = process.argv.slice(2)

const env = { ...process.env }

if (!env.TAURI_SIGNING_PRIVATE_KEY_PATH && !env.TAURI_SIGNING_PRIVATE_KEY && existsSync(updaterKeyPath)) {
  env.TAURI_SIGNING_PRIVATE_KEY_PATH = updaterKeyPath
  env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(updaterKeyPath, 'utf8').trim()
}

if (!('TAURI_SIGNING_PRIVATE_KEY_PASSWORD' in env)) {
  env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
}

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

const buildIcons = spawnSync(pnpmCommand, ['tauri:icons'], {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
  shell: true,
})

if ((buildIcons.status ?? 1) !== 0) {
  process.exit(buildIcons.status ?? 1)
}

if (process.platform === 'darwin') {
  const generateMacIcns = spawnSync('bash', ['scripts/generate-macos-icns.sh'], {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
    shell: true,
  })

  if ((generateMacIcns.status ?? 1) !== 0) {
    process.exit(generateMacIcns.status ?? 1)
  }
}

const tauriBuild = spawnSync(pnpmCommand, ['exec', 'tauri', 'build', ...forwardedBuildArgs], {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
  shell: true,
})

if ((tauriBuild.status ?? 1) !== 0) {
  process.exit(tauriBuild.status ?? 1)
}

if (process.platform === 'win32') {
  const manifestBuild = spawnSync('node', ['scripts/generate-updater-manifest.mjs'], {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
    shell: true,
  })

  process.exit(manifestBuild.status ?? 1)
}

process.exit(0)
