import { describe, it, expect, vi } from 'vitest'
import { organizeToApply, proposeOrganize, type ActionDeps } from './actions'
import type { FileContent } from './budget'
import type { AiHealth } from './runtime'

const okHealth: AiHealth = { ok: true, providers: { ollama: true } }
const file = (path: string, text = 'x'): FileContent => ({
  path,
  name: path.split('/').pop()!,
  isDir: false,
  size: text.length,
  text,
})
const deps = (impl: unknown): ActionDeps =>
  ({ model: 'm', health: okHealth, callModel: impl } as ActionDeps)

describe('proposeOrganize', () => {
  it('keeps only known files, flags unknown ones, and drops invalid folder names', async () => {
    const call = vi.fn(async () => ({
      groups: [
        { folder: 'foto', files: ['/d/a.jpg', '/d/ghost.png'] },
        { folder: '../bad', files: ['/d/b.txt'] }, // invalid folder → leave in place
      ],
    }))
    const plan = await proposeOrganize([file('/d/a.jpg'), file('/d/b.txt')], deps(call))
    expect(plan.folders).toEqual(['foto'])
    expect(plan.unknown).toEqual(['/d/ghost.png'])
    // b.txt assigned to an invalid folder => dstFolder '' (no move)
    const b = plan.moves.find((m) => m.src === '/d/b.txt')!
    expect(b.dstFolder).toBe('')
    const a = plan.moves.find((m) => m.src === '/d/a.jpg')!
    expect(a.dstFolder).toBe('foto')
  })

  it('throws when AI is unavailable', async () => {
    await expect(
      proposeOrganize([], { model: 'm', health: { ok: false, providers: {} } }),
    ).rejects.toThrow()
  })
})

describe('organizeToApply', () => {
  it('builds folder paths and de-duplicated move destinations', () => {
    const applied = organizeToApply(
      {
        folders: ['foto'],
        moves: [
          { src: '/d/a.png', dstFolder: 'foto' },
          { src: '/d/sub/a.png', dstFolder: 'foto' }, // same base name → collide
          { src: '/d/root.txt', dstFolder: '' }, // root → no move
        ],
        unknown: [],
      },
      '/d',
    )
    expect(applied.folders).toEqual(['/d/foto'])
    expect(applied.moves.map((m) => m.dst)).toEqual([
      '/d/foto/a.png',
      '/d/foto/a copy 1.png',
    ])
  })
})
