import { describe, it, expect } from 'vitest'
import {
  validateNewName,
  uniqueName,
  validateRenames,
  basename,
  undoMove,
  undoRename,
} from './safety'

describe('validateNewName (mirrors Rust rename rules)', () => {
  it('rejects empty / whitespace-only names', () => {
    expect(validateNewName('  ').ok).toBe(false)
    expect(validateNewName('report .txt').name).toBe('report .txt') // internal space ok
  })
  it('rejects dot segments and separators', () => {
    expect(validateNewName('.').ok).toBe(false)
    expect(validateNewName('..').ok).toBe(false)
    expect(validateNewName('a/b').ok).toBe(false)
    expect(validateNewName('bad\u0000name').ok).toBe(false)
  })
  it('accepts and trims a normal name', () => {
    const r = validateNewName('  invoice-acme.pdf  ')
    expect(r.ok).toBe(true)
    expect(r.name).toBe('invoice-acme.pdf')
  })
})

describe('uniqueName (backend-style suffixes)', () => {
  it('returns the name when free', () => {
    expect(uniqueName('a.txt', new Set(['b.txt']))).toBe('a.txt')
  })
  it('appends " copy N" on collision, file extension preserved', () => {
    expect(uniqueName('a.txt', new Set(['a.txt']))).toBe('a copy 1.txt')
    expect(uniqueName('a.txt', new Set(['a.txt', 'a copy 1.txt']))).toBe('a copy 2.txt')
  })
  it('handles directories (no extension)', () => {
    expect(uniqueName('docs', new Set(['docs']), true)).toBe('docs copy 1')
  })
})

describe('basename', () => {
  it('returns last segment ignoring trailing slash', () => {
    expect(basename('/Users/x/Projects/repo')).toBe('repo')
    expect(basename('/Users/x/Projects/repo/')).toBe('repo')
    expect(basename('file.txt')).toBe('file.txt')
  })
})

describe('validateRenames (batch)', () => {
  it('flags invalid names and no-ops', () => {
    const res = validateRenames(
      [
        { path: '/d/a.txt', newName: 'a/bad' },
        { path: '/d/keep.txt', newName: 'keep.txt' },
      ],
      ['a.txt', 'keep.txt'],
    )
    expect(res[0].ok).toBe(false)
    expect(res[1].ok).toBe(false)
    expect(res[1].error).toBe('No change')
  })

  it('resolves collisions against disk and within the batch', () => {
    const res = validateRenames(
      [
        { path: '/d/a.txt', newName: 'final.txt' }, // ok
        { path: '/d/b.txt', newName: 'final.txt' }, // collides with a.txt's target
        { path: '/d/c.txt', newName: 'existing.txt' }, // collides with disk
      ],
      ['a.txt', 'b.txt', 'c.txt', 'existing.txt'],
    )
    expect(res[0].to).toBe('final.txt')
    expect(res[1].to).toBe('final copy 1.txt')
    expect(res[2].to).toBe('existing copy 1.txt')
    expect(res.every((r) => r.ok)).toBe(true)
  })

  it('lets an item reuse its own vacated name', () => {
    const res = validateRenames(
      [
        { path: '/d/x.txt', newName: 'y.txt' },
        { path: '/d/y.txt', newName: 'x.txt' },
      ],
      ['x.txt', 'y.txt'],
    )
    expect(res[0].to).toBe('y.txt')
    expect(res[1].to).toBe('x.txt')
  })
})

describe('undo inverses', () => {
  it('undoRename stores the restore name', () => {
    expect(undoRename('/d/new.txt', 'old.txt')).toEqual({
      kind: 'rename',
      path: '/d/new.txt',
      restoreName: 'old.txt',
    })
  })
  it('undoMove inverts from/to', () => {
    expect(undoMove('/d/sub/a.txt', '/d/a.txt')).toEqual({
      kind: 'move',
      from: '/d/sub/a.txt',
      to: '/d/a.txt',
    })
  })
})
