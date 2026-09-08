import { describe, it, expect } from 'vitest'
import { applyPlan, undoPlan, type Fs } from './apply'

/** In-memory filesystem fake tracking renames/moves/folders. */
function makeFs(initial: string[]) {
  const nodes = new Set(initial)
  const fs: Fs = {
    exists: async (p) => nodes.has(p),
    createFolder: async (parent, name) => {
      const path = `${parent}/${name}`
      nodes.add(path)
      return path
    },
    rename: async (path, newName) => {
      if (!nodes.has(path)) throw new Error('missing')
      const parent = path.slice(0, path.lastIndexOf('/'))
      nodes.delete(path)
      nodes.add(`${parent}/${newName}`)
    },
    move: async (src, dst) => {
      if (!nodes.has(src)) throw new Error('missing')
      nodes.delete(src)
      nodes.add(dst)
    },
  }
  return { fs, nodes }
}

describe('applyPlan', () => {
  it('applies renames, building an inverse journal', async () => {
    const { fs, nodes } = makeFs(['/d/a.txt', '/d/b.txt'])
    const r = await applyPlan(fs, {
      renames: [
        { path: '/d/a.txt', newName: 'alpha.txt' },
        { path: '/d/b.txt', newName: 'beta.txt' },
      ],
    })
    expect(r.applied).toBe(2)
    expect(nodes.has('/d/alpha.txt')).toBe(true)
    expect(r.undo).toEqual([
      { kind: 'rename', path: '/d/alpha.txt', restoreName: 'a.txt' },
      { kind: 'rename', path: '/d/beta.txt', restoreName: 'b.txt' },
    ])
  })

  it('skips targets that vanished (re-checked at apply time)', async () => {
    const { fs } = makeFs(['/d/a.txt'])
    const r = await applyPlan(fs, {
      renames: [
        { path: '/d/a.txt', newName: 'a2.txt' },
        { path: '/d/gone.txt', newName: 'x.txt' },
      ],
    })
    expect(r.applied).toBe(1)
    expect(r.skipped).toBe(1)
  })
})

describe('undoPlan', () => {
  it('reverts an applied rename batch in reverse order', async () => {
    const { fs, nodes } = makeFs(['/d/a.txt', '/d/b.txt'])
    const applied = await applyPlan(fs, {
      renames: [
        { path: '/d/a.txt', newName: 'alpha.txt' },
        { path: '/d/b.txt', newName: 'beta.txt' },
      ],
    })
    await undoPlan(fs, applied.undo)
    expect(nodes.has('/d/a.txt')).toBe(true)
    expect(nodes.has('/d/b.txt')).toBe(true)
    expect(nodes.has('/d/alpha.txt')).toBe(false)
  })
})
