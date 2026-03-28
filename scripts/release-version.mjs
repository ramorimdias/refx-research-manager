import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const packageJsonPath = join(repoRoot, 'package.json')
const tauriConfigPath = join(repoRoot, 'src-tauri', 'tauri.conf.json')
const cargoTomlPath = join(repoRoot, 'src-tauri', 'Cargo.toml')

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

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'))
const cargoToml = readFileSync(cargoTomlPath, 'utf8')

const currentPackageVersion = packageJson.version
const currentTauriVersion = tauriConfig.version
const cargoVersionMatch = cargoToml.match(/^version = "([^"]+)"$/m)
const currentCargoVersion = cargoVersionMatch?.[1]

if (!currentCargoVersion) {
  console.error('Release aborted: could not find version in src-tauri/Cargo.toml')
  process.exit(1)
}

packageJson.version = nextVersion
tauriConfig.version = nextVersion
const nextCargoToml = cargoToml.replace(/^version = "([^"]+)"$/m, `version = "${nextVersion}"`)

writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)
writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`)
writeFileSync(cargoTomlPath, nextCargoToml)

console.log(`Updated REFX version to ${nextVersion}`)
console.log(`- package.json: ${currentPackageVersion} -> ${packageJson.version}`)
console.log(`- src-tauri/tauri.conf.json: ${currentTauriVersion} -> ${tauriConfig.version}`)
console.log(`- src-tauri/Cargo.toml: ${currentCargoVersion} -> ${nextVersion}`)
console.log('')
console.log('Building signed release...')

run('pnpm.cmd', ['tauri:build'])

console.log('')
console.log('Creating git release commit...')

run('git', ['add', 'package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml'])
run('git', ['commit', '-m', `Release v${nextVersion}`])
run('git', ['tag', `v${nextVersion}`])
run('git', ['push', 'origin', branch, '--tags'])

console.log('')
console.log(`Release v${nextVersion} completed and pushed on branch ${branch}.`)
