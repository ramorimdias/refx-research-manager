import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const updaterKeyPath = resolve(repoRoot, '.tauri', 'refx-updater.key')

const env = { ...process.env }

if (!env.TAURI_SIGNING_PRIVATE_KEY_PATH && !env.TAURI_SIGNING_PRIVATE_KEY && existsSync(updaterKeyPath)) {
  env.TAURI_SIGNING_PRIVATE_KEY_PATH = updaterKeyPath
  env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(updaterKeyPath, 'utf8').trim()
}

const build = spawnSync('pnpm.cmd', ['tauri:icons'], {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
  shell: true,
})

if ((build.status ?? 1) !== 0) {
  process.exit(build.status ?? 1)
}

const tauriBuild = spawnSync('pnpm.cmd', ['exec', 'tauri', 'build'], {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
  shell: true,
})

process.exit(tauriBuild.status ?? 1)
