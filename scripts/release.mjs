#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stableVersionPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export function parseVersion(value) {
  const match = stableVersionPattern.exec(value)
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

export function compareVersions(a, b) {
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] - b[key]
  }
  return 0
}

export function bumpVersion(version, level) {
  const parsed = typeof version === 'string' ? parseVersion(version) : version
  if (!parsed) throw new Error(`Invalid stable SemVer version: ${version}`)
  if (level === 'major') return `${parsed.major + 1}.0.0`
  if (level === 'minor') return `${parsed.major}.${parsed.minor + 1}.0`
  if (level === 'patch') return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`
  throw new Error(`Unknown release level: ${level}`)
}

export function parseConventionalCommit(message) {
  const [subject, ...bodyLines] = message.trim().split(/\r?\n/)
  const match = /^(\w+)(?:\(([^)]+)\))?(!)?: (.+)$/.exec(subject ?? '')
  const body = bodyLines.join('\n')
  const breaking = Boolean(match?.[3]) || /^BREAKING CHANGE:\s*\S/im.test(body)
  const type = match?.[1]?.toLowerCase()
  let level = null
  if (breaking) level = 'major'
  else if (type === 'feat') level = 'minor'
  else if (['fix', 'perf', 'revert'].includes(type)) level = 'patch'
  return {
    type: type ?? null,
    scope: match?.[2] ?? null,
    subject: match?.[4] ?? subject ?? '',
    breaking,
    level,
  }
}

export function releaseLevel(commits) {
  const levels = commits.map((commit) => commit.level).filter(Boolean)
  if (levels.includes('major')) return 'major'
  if (levels.includes('minor')) return 'minor'
  if (levels.includes('patch')) return 'patch'
  return null
}

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', ...options }).trim()
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'))
}

function readCurrentVersions() {
  const tauri = readJson('tauri.conf.json').version
  const cargoToml = readFileSync(path.join(root, 'Cargo.toml'), 'utf8')
  const packageJson = readJson('frontend/package.json')
  const packageLock = readJson('frontend/package-lock.json')
  const cargoLock = readFileSync(path.join(root, 'Cargo.lock'), 'utf8')
  const cliveLockEntry = /^\[\[package\]\]\nname = "clive"\nversion = "([^"]+)"/m.exec(cargoLock)?.[1]
  const cargoVersion = /^\[package\][\s\S]*?^version = "([^"]+)"/m.exec(cargoToml)?.[1]
  const versions = {
    'tauri.conf.json': tauri,
    'Cargo.toml': cargoVersion,
    'Cargo.lock (clive)': cliveLockEntry,
    'frontend/package.json': packageJson.version,
    'frontend/package-lock.json': packageLock.version,
    'frontend/package-lock.json (root)': packageLock.packages?.['']?.version,
  }
  const mismatches = Object.entries(versions).filter(([, version]) => version !== tauri)
  if (!tauri || mismatches.length) {
    throw new Error(`Version mismatch. Expected all project manifests to match ${tauri ?? '(missing)'}:\n${mismatches.map(([file, version]) => `  ${file}: ${version ?? '(missing)'}`).join('\n')}`)
  }
  return tauri
}

function latestVersionTag() {
  const tags = git(['tag', '--list', 'v[0-9]*'])
    .split('\n')
    .map((tag) => ({ tag, version: parseVersion(tag) }))
    .filter((entry) => entry.version)
    .sort((a, b) => compareVersions(b.version, a.version))
  return tags[0] ?? null
}

function readCommitsSince(tag) {
  const output = git(['log', `${tag}..HEAD`, '--format=%s%x1f%b%x1e'])
  return output.split('\x1e').map((record) => record.trim()).filter(Boolean).map(parseConventionalCommit)
}

function ensureCleanWorktree() {
  if (git(['status', '--porcelain'])) throw new Error('The worktree must be clean before applying a release.')
}

function renderGeneratedNotes(commits) {
  const sections = [
    ['major', 'Breaking Changes'],
    ['minor', 'Added'],
    ['patch', 'Fixed'],
  ]
  return sections.flatMap(([level, title]) => {
    const entries = commits.filter((commit) => commit.level === level)
    return entries.length ? [`### ${title}`, ...entries.map(({ scope, subject }) => `- ${scope ? `**${scope}:** ` : ''}${subject}`)] : []
  }).join('\n')
}

function updateChangelog(version, commits) {
  const changelogPath = path.join(root, 'CHANGELOG.md')
  const changelog = readFileSync(changelogPath, 'utf8')
  const unreleased = /^## \[Unreleased\]\s*\n([\s\S]*?)(?=\n## \[|$)/m.exec(changelog)
  const manualNotes = unreleased?.[1]?.trim() ?? ''
  const notes = manualNotes || renderGeneratedNotes(commits)
  if (!notes) throw new Error('Add release notes under [Unreleased] before creating a release.')
  const date = new Date().toISOString().slice(0, 10)
  const releaseSection = `## [${version}] - ${date}\n${notes}`
  let updated
  if (unreleased) {
    updated = changelog.replace(unreleased[0], `## [Unreleased]\n\n${releaseSection}`)
  } else {
    const firstSection = changelog.search(/^## \[/m)
    if (firstSection < 0) throw new Error('Could not find the changelog release section.')
    updated = `${changelog.slice(0, firstSection)}## [Unreleased]\n\n${releaseSection}\n\n${changelog.slice(firstSection)}`
  }
  writeFileSync(changelogPath, updated)
}

function writeVersion(version) {
  const update = (relativePath, transform) => {
    const filePath = path.join(root, relativePath)
    writeFileSync(filePath, transform(readFileSync(filePath, 'utf8')))
  }
  update('tauri.conf.json', (text) => `${JSON.stringify({ ...JSON.parse(text), version }, null, 2)}\n`)
  update('Cargo.toml', (text) => text.replace(/(^\[package\][\s\S]*?^version = ")[^"]+("$)/m, `$1${version}$2`))
  update('Cargo.lock', (text) => text.replace(/(^\[\[package\]\]\nname = "clive"\nversion = ")[^"]+("$)/m, `$1${version}$2`))
  update('frontend/package.json', (text) => `${JSON.stringify({ ...JSON.parse(text), version }, null, 2)}\n`)
  update('frontend/package-lock.json', (text) => {
    const lock = JSON.parse(text)
    lock.version = version
    lock.packages[''].version = version
    return `${JSON.stringify(lock, null, 2)}\n`
  })
  update('README.md', (text) => text.replace(/(!\[version\]\(https:\/\/img\.shields\.io\/badge\/version-)[^-)]+(-green\))/u, `$1${version}$2`))
}

function bootstrap() {
  ensureCleanWorktree()
  const currentVersion = readCurrentVersions()
  if (latestVersionTag()) throw new Error('A SemVer tag already exists; remove --bootstrap and use --apply instead.')
  const tag = `v${currentVersion}`
  git(['tag', '-a', tag, '-m', `Clive ${tag} baseline`])
  console.log(`Created local baseline tag ${tag}. Push it to the canonical Gitea remote to enable tag builds.`)
}

function release(apply) {
  const currentVersion = readCurrentVersions()
  const baseline = latestVersionTag()
  if (!baseline) throw new Error(`No SemVer tag found. After committing the current ${currentVersion} release state, run: node scripts/release.mjs --bootstrap`)
  if (`v${currentVersion}` !== baseline.tag) {
    throw new Error(`The latest tag is ${baseline.tag}, but manifests say ${currentVersion}. Restore parity before releasing.`)
  }
  const commits = readCommitsSince(baseline.tag)
  const level = releaseLevel(commits)
  if (!level) throw new Error('No releasable conventional commits found. feat => minor, fix/perf/revert => patch, BREAKING CHANGE or ! => major.')
  const next = bumpVersion(currentVersion, level)
  console.log(`SemVer: ${currentVersion} → ${next} (${level})`)
  console.log(`Commits considered: ${commits.filter((commit) => commit.level).length}`)
  if (!apply) {
    console.log('Dry run only. Pass --apply on a clean worktree to update manifests, promote Unreleased notes, commit, and tag.')
    return
  }
  ensureCleanWorktree()
  writeVersion(next)
  updateChangelog(next, commits)
  git(['add', 'tauri.conf.json', 'Cargo.toml', 'Cargo.lock', 'frontend/package.json', 'frontend/package-lock.json', 'CHANGELOG.md', 'README.md'])
  git(['commit', '-m', `chore(release): v${next}`])
  git(['tag', '-a', `v${next}`, '-m', `Clive v${next}`])
  console.log(`Created release commit and local tag v${next}. Review and push the commit and tag to Gitea to start its release workflow.`)
}

function main() {
  const args = process.argv.slice(2)
  const allowed = new Set(['--dry-run', '--apply', '--bootstrap'])
  const unknown = args.find((arg) => !allowed.has(arg))
  if (unknown) throw new Error(`Unknown argument: ${unknown}`)
  if (args.includes('--apply') && args.includes('--bootstrap')) throw new Error('Choose either --apply or --bootstrap.')
  if (args.includes('--apply') && args.includes('--dry-run')) throw new Error('Choose either --dry-run or --apply.')
  if (args.includes('--bootstrap')) return bootstrap()
  return release(args.includes('--apply'))
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    main()
  } catch (error) {
    console.error(`Release failed: ${error.message}`)
    process.exitCode = 1
  }
}
