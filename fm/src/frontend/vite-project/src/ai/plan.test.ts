import { describe, it, expect } from 'vitest'
import { validateFolderPath, expandPlan, orderPlanOps, type ModelPlanShape, type FileEntry } from './plan.js'

const entry = (name: string, isDir = false): FileEntry =>
  ({ name, path: `/root/${name}`, isDir, size: isDir ? 0 : 5, modified: 0, extension: null }) as unknown as FileEntry
const ctx = (entries: FileEntry[], guardOn = true): { rootPath: string; entries: FileEntry[]; guardOn: boolean } =>
  ({ rootPath: '/root', entries, guardOn })
const empty: ModelPlanShape = { folders: [], assignments: [], renames: [], trash: [] }

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

describe('expandPlan', () => {
  it('expands folders into depth-ordered createFolder ops', () => {
    const p = expandPlan({ ...empty, folders: ['01_Personal/CV'] }, ctx([]))
    const folders = p.ops.filter((o) => o.kind === 'createFolder')
    expect(folders.map((f) => f.path)).toEqual(['/root/01_Personal', '/root/01_Personal/CV'])
  })

  it('resolves assignment basename to absolute src and dest dir', () => {
    const p = expandPlan({ ...empty, folders: ['CV'], assignments: [{ file: 'cv.pdf', to: 'CV' }] }, ctx([entry('cv.pdf')]))
    const mv = p.ops.find((o) => o.kind === 'move')!
    expect(mv.path).toBe('/root/cv.pdf')
    expect(mv.destDir).toBe('/root/CV')
  })

  it('flags unknown basename as issue and never included', () => {
    const p = expandPlan({ ...empty, assignments: [{ file: 'ghost.pdf', to: '.' }] }, ctx([entry('real.pdf')]))
    const ghost = p.ops.find((o) => o.kind === 'move')!
    expect(ghost.included).toBe(false)
    expect(ghost.issue).toBeTruthy()
  })

  it('does not move a file into its current location', () => {
    const p = expandPlan({ ...empty, assignments: [{ file: 'x.txt', to: '' }] }, ctx([entry('x.txt')]))
    expect(p.ops.some((o) => o.kind === 'move')).toBe(false)
  })

  it('dedups same source appearing twice (last wins, prior marked)', () => {
    const p = expandPlan({ ...empty, folders: ['A', 'B'], assignments: [{ file: 'x.txt', to: 'A' }, { file: 'x.txt', to: 'B' }] }, ctx([entry('x.txt')]))
    const moves = p.ops.filter((o) => o.kind === 'move')
    expect(moves.filter((m) => m.included).length).toBe(1)
  })

  it('collects unassigned entries into unchanged', () => {
    const p = expandPlan({ ...empty, assignments: [{ file: 'a.txt', to: '' }] }, ctx([entry('a.txt'), entry('b.txt')]))
    expect(p.unchanged.map((u) => u.name)).toEqual(['b.txt'])
  })

  it('marks protected source as issue when guard on', () => {
    const c = ctx([entry('System')])
    const p = expandPlan({ ...empty, trash: [{ file: 'System' }] }, { ...c, entries: [{ ...entry('System'), path: '/System', isDir: true } as FileEntry] })
    const t = p.ops.find((o) => o.kind === 'trash')!
    expect(t.included).toBe(false)
    expect(t.issue).toBeTruthy()
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
