import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bumpVersion, compareVersions, parseConventionalCommit, parseVersion, releaseLevel } from './release.mjs'

test('parses stable SemVer tags and rejects malformed versions', () => {
  assert.deepEqual(parseVersion('v1.12.3'), { major: 1, minor: 12, patch: 3 })
  assert.equal(parseVersion('1.2'), null)
  assert.equal(parseVersion('v01.2.3'), null)
})

test('bumps major, minor, and patch versions', () => {
  assert.equal(bumpVersion('1.2.3', 'major'), '2.0.0')
  assert.equal(bumpVersion('1.2.3', 'minor'), '1.3.0')
  assert.equal(bumpVersion('1.2.3', 'patch'), '1.2.4')
  assert.equal(compareVersions(parseVersion('1.3.0'), parseVersion('1.2.99')) > 0, true)
})

test('maps Conventional Commits to SemVer levels', () => {
  assert.equal(parseConventionalCommit('feat(navigator): rename navigation panel').level, 'minor')
  assert.equal(parseConventionalCommit('fix(tags): preserve labels').level, 'patch')
  assert.equal(parseConventionalCommit('docs: update release guide').level, null)
  assert.equal(parseConventionalCommit('feat(api)!: remove legacy option').level, 'major')
  assert.equal(parseConventionalCommit('refactor: reshape API\n\nBREAKING CHANGE: callers must pass a context').level, 'major')
})

test('selects the highest required release level', () => {
  const commits = ['feat: add navigator', 'fix: repair tags'].map(parseConventionalCommit)
  assert.equal(releaseLevel(commits), 'minor')
  assert.equal(releaseLevel([parseConventionalCommit('docs: clarify setup')]), null)
})

test('release apply updates all version files and creates an annotated release tag', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'clive-semver-'))
  const run = (command, args) => execFileSync(command, args, { cwd: temp, encoding: 'utf8' }).trim()
  const write = (relative, contents) => {
    const target = path.join(temp, relative)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, contents)
  }
  try {
    mkdirSync(path.join(temp, 'scripts'))
    copyFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'release.mjs'), path.join(temp, 'scripts/release.mjs'))
    write('tauri.conf.json', '{\n  "version": "1.1.2"\n}\n')
    write('Cargo.toml', '[package]\nname = "clive"\nversion = "1.1.2"\n')
    write('Cargo.lock', '[[package]]\nname = "clive"\nversion = "1.1.2"\n')
    write('frontend/package.json', '{\n  "name": "clive-frontend",\n  "version": "1.1.2"\n}\n')
    write('frontend/package-lock.json', '{\n  "version": "1.1.2",\n  "packages": {\n    "": { "version": "1.1.2" }\n  }\n}\n')
    write('CHANGELOG.md', '# Changelog\n\n## [Unreleased]\n### Added\n- Add the Navigator\n\n## [1.1.2] - 2026-10-16\n')
    write('README.md', '![version](https://img.shields.io/badge/version-1.1.2-green)\n')
    run('git', ['init', '-q'])
    run('git', ['config', 'user.name', 'Clive Test'])
    run('git', ['config', 'user.email', 'clive-test@example.invalid'])
    run('git', ['add', '.'])
    run('git', ['commit', '-qm', 'chore(release): v1.1.2'])
    run('git', ['tag', '-a', 'v1.1.2', '-m', 'Clive v1.1.2'])
    run('git', ['commit', '--allow-empty', '-m', 'feat(navigator): rename the sidebar'])

    const script = path.join(temp, 'scripts/release.mjs')
    const preview = run('node', [script, '--dry-run'])
    assert.match(preview, /1\.1\.2 → 1\.2\.0 \(minor\)/, `preview=${JSON.stringify(preview)} script=${script}`)
    run('node', [script, '--apply'])

    assert.equal(JSON.parse(readFileSync(path.join(temp, 'tauri.conf.json'))).version, '1.2.0')
    assert.equal(JSON.parse(readFileSync(path.join(temp, 'frontend/package.json'))).version, '1.2.0')
    assert.equal(JSON.parse(readFileSync(path.join(temp, 'frontend/package-lock.json'))).packages[''].version, '1.2.0')
    assert.match(readFileSync(path.join(temp, 'Cargo.toml'), 'utf8'), /version = "1\.2\.0"/)
    assert.match(readFileSync(path.join(temp, 'Cargo.lock'), 'utf8'), /version = "1\.2\.0"/)
    assert.match(readFileSync(path.join(temp, 'README.md'), 'utf8'), /version-1\.2\.0-green/)
    assert.match(readFileSync(path.join(temp, 'CHANGELOG.md'), 'utf8'), /## \[1\.2\.0\]/)
    assert.equal(run('git', ['tag', '--list', 'v1.2.0']), 'v1.2.0')
    assert.match(run('git', ['cat-file', '-t', 'v1.2.0']), /tag/)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
