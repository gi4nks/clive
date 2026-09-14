import { describe, it, expect } from 'vitest'
import { validateFolderPath, expandPlan, orderPlanOps, type ModelPlanShape, type FileEntry } from './plan.js'

const entry = (name: string, isDir = false): FileEntry =>
  ({ name, path: `/root/${name}`, isDir, size: isDir ? 0 : 5, modified: 0, extension: null }) as unknown as FileEntry
const ctx = (entries: FileEntry[], guardOn = true): { rootPath: string; entries: FileEntry[]; guardOn: boolean } =>
  ({ rootPath: '/root', entries, guardOn })
const empty: ModelPlanShape = { folders: [], rules: [], renames: [], trashPatterns: [] }

describe('validateFolderPath', () => {
  it('accepts nested relative paths', () => {
    expect(validateFolderPath('01_Personal/CV').ok).toBe(true)
  })
  it('rejects .. traversal', () => {
    expect(validateFolderPath('a/../b').ok).toBe(false)
    expect(validateFolderPath('../etc').ok).toBe(false)
  })
  it('rejects empty segments', () => {
    expect(validateFolderPath('a//b').ok).toBe(false)
    expect(validateFolderPath('a/').ok).toBe(false)
  })
})

describe('expandPlan (rule-based)', () => {
  it('expands folders into depth-ordered createFolder ops', () => {
    const p = expandPlan({ ...empty, folders: ['01_Personal/CV'] }, ctx([]))
    const folders = p.ops.filter((o) => o.kind === 'createFolder')
    expect(folders.map((f) => f.path)).toEqual(['/root/01_Personal', '/root/01_Personal/CV'])
  })

  it('assigns entries to folders by substring rule (first match wins)', () => {
    const p = expandPlan({ ...empty, rules: [{ match: 'cv', to: '03_Lavoro/CV' }] }, ctx([entry('cv.pdf'), entry('cover.txt')]))
    const moves = p.ops.filter((o) => o.kind === 'move')
    expect(moves).toHaveLength(1)
    expect(moves[0]).toMatchObject({ path: '/root/cv.pdf', destDir: '/root/03_Lavoro/CV', included: true })
  })

  it('matches by extension when the rule starts with a dot', () => {
    const p = expandPlan({ ...empty, rules: [{ match: '.epub', to: '05_Lettura' }] }, ctx([entry('book.epub'), entry('book.pdf')]))
    const moves = p.ops.filter((o) => o.kind === 'move')
    expect(moves).toHaveLength(1)
    expect(moves[0].path).toBe('/root/book.epub')
  })

  it('trashPatterns take priority over rules', () => {
    const p = expandPlan({ ...empty, rules: [{ match: '.dmg', to: '09_Software' }], trashPatterns: ['(1)'] }, ctx([entry('App(1).dmg')]))
    expect(p.ops.some((o) => o.kind === 'trash')).toBe(true)
    expect(p.ops.some((o) => o.kind === 'move')).toBe(false)
  })

  it('moves unmatched entries to fallback when set', () => {
    const p = expandPlan({ ...empty, rules: [{ match: 'cv', to: 'CV' }], fallback: '00_Inbox' }, ctx([entry('cv.pdf'), entry('misc.txt')]))
    const misc = p.ops.find((o) => o.kind === 'move' && o.path === '/root/misc.txt')
    expect(misc?.destDir).toBe('/root/00_Inbox')
  })

  it('leaves unmatched entries unchanged when there is no fallback', () => {
    const p = expandPlan({ ...empty, rules: [{ match: 'a.txt', to: 'X' }] }, ctx([entry('a.txt'), entry('b.txt')]))
    expect(p.unchanged.map((u) => u.name)).toEqual(['b.txt'])
  })

  it('warns about a rule that matched nothing', () => {
    const p = expandPlan({ ...empty, rules: [{ match: 'zzz', to: 'X' }] }, ctx([entry('a.txt')]))
    expect(p.warnings.some((w) => w.includes('zzz'))).toBe(true)
  })

  it('does not move a folder into its own subtree', () => {
    const p = expandPlan({ ...empty, rules: [{ match: 'stuff', to: 'stuff/inner' }] }, ctx([entry('stuff', true)]))
    const mv = p.ops.find((o) => o.kind === 'move')
    expect(mv?.included).toBe(false)
    expect(mv?.issue).toBe('invalid destination')
  })

  it('marks a protected source as issue when guard is on', () => {
    const sys = { name: 'System', path: '/System', isDir: true, size: 0, modified: 0, extension: null } as unknown as FileEntry
    const p = expandPlan({ ...empty, trashPatterns: ['System'] }, { rootPath: '/root', guardOn: true, entries: [sys] })
    const t = p.ops.find((o) => o.kind === 'trash')!
    expect(t.included).toBe(false)
    expect(t.issue).toBe('protected')
  })

  it('rejects a nested folder path with .. anywhere', () => {
    const p = expandPlan({ ...empty, folders: ['a/../../b'] }, ctx([]))
    const folderCreates = p.ops.filter((o) => o.kind === 'createFolder')
    expect(folderCreates.every((f) => !f.included || f.path.startsWith('/root/'))).toBe(true)
    const bad = folderCreates.find((f) => f.issue)
    expect(bad).toBeTruthy()
  })

  it('folder path under a protected root is excluded when guard on', () => {
    const c = { rootPath: '/System', entries: [] as FileEntry[], guardOn: true }
    const p = expandPlan({ ...empty, folders: ['Foo'] }, c)
    const folders = p.ops.filter((o) => o.kind === 'createFolder')
    expect(folders.length).toBeGreaterThan(0)
    expect(folders.every((f) => !f.included && f.issue === 'protected')).toBe(true)
    const off = expandPlan({ ...empty, folders: ['Foo'] }, { ...c, guardOn: false })
    expect(off.ops.filter((o) => o.kind === 'createFolder').every((f) => f.included)).toBe(true)
  })

  it('createFolder colliding with an existing entry is excluded with target-exists issue', () => {
    const p = expandPlan({ ...empty, folders: ['Docs'] }, ctx([entry('Docs', true)]))
    const folders = p.ops.filter((o) => o.kind === 'createFolder')
    expect(folders.length).toBe(1)
    expect(folders[0].included).toBe(false)
    expect(folders[0].issue).toBe('target exists')
  })
})

describe('orderPlanOps', () => {
  it('orders create (depth asc) before rename before move before trash', () => {
    const ops = [
      { id: 'm', kind: 'move' as const, path: '/r/a', destDir: '/r/x', included: true },
      { id: 't', kind: 'trash' as const, path: '/r/b', included: true },
      { id: 'c2', kind: 'createFolder' as const, path: '/r/x/y', included: true },
      { id: 'c1', kind: 'createFolder' as const, path: '/r/x', included: true },
      { id: 'rn', kind: 'rename' as const, path: '/r/a', newName: 'a2', included: true },
    ]
    expect(orderPlanOps(ops).map((o) => o.id)).toEqual(['c1', 'c2', 'rn', 'm', 't'])
  })
})
