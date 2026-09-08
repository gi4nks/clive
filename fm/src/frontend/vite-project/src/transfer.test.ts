import { describe, it, expect, vi } from 'vitest'
import { planTransfer, runTransfer, transferBatch } from './transfer'

vi.mock('./api', () => ({
  copyFile: vi.fn(async () => {}),
  moveFile: vi.fn(async () => {}),
  transferItems: vi.fn(async () => ({ applied: 0, failures: [] })),
}))
import { copyFile, moveFile, transferItems } from './api'

describe('planTransfer', () => {
  it('joins into dst dir and keeps non-colliding names', () => {
    const ops = planTransfer(['/a/x.txt', '/a/y.pdf'], '/b', [])
    expect(ops).toEqual([
      { src: '/a/x.txt', dst: '/b/x.txt' },
      { src: '/a/y.pdf', dst: '/b/y.pdf' },
    ])
  })

  it('de-dupes against existing names in the destination', () => {
    const ops = planTransfer(['/a/x.txt'], '/b', ['x.txt'])
    expect(ops[0].dst).toBe('/b/x copy 1.txt')
  })

  it('de-dupes within the batch', () => {
    const ops = planTransfer(['/p1/note.md', '/p2/note.md'], '/dst', [])
    expect(ops.map((o) => o.dst)).toEqual(['/dst/note.md', '/dst/note copy 1.md'])
  })

  it('treats dirs (no extension) via isDir', () => {
    const ops = planTransfer(['/a/photos'], '/b', ['photos'], (p) => p.endsWith('photos'))
    expect(ops[0].dst).toBe('/b/photos copy 1')
  })

  it('handles trailing slash on dest and root/empty dir', () => {
    expect(planTransfer(['/a/x'], '/b/', [])[0].dst).toBe('/b/x')
    expect(planTransfer(['/x'], '', [])[0].dst).toBe('/x') // empty dir → "/"+name
    expect(planTransfer(['/x'], '/', [])[0].dst).toBe('/x') // root
  })
})

describe('runTransfer', () => {
  it('uses copyFile for copy and moveFile for move', async () => {
    ;(copyFile as ReturnType<typeof vi.fn>).mockClear()
    ;(moveFile as ReturnType<typeof vi.fn>).mockClear()
    const ops = planTransfer(['/a/x'], '/b', [])
    await runTransfer(ops, 'copy')
    expect(copyFile).toHaveBeenCalledWith('/a/x', '/b/x')
    await runTransfer(ops, 'move')
    expect(moveFile).toHaveBeenCalledWith('/a/x', '/b/x')
  })

  it('collects failures without throwing', async () => {
    ;(moveFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('nope'))
    const r = await runTransfer(planTransfer(['/a/x'], '/b', []), 'move')
    expect(r.applied).toBe(0)
    expect(r.failures).toHaveLength(1)
  })
})

describe('transferBatch', () => {
  it('uses the single batch command when available', async () => {
    ;(transferItems as ReturnType<typeof vi.fn>).mockClear()
    ;(transferItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ applied: 2, failures: [] })
    const r = await transferBatch(['/a/x', '/a/y'], '/b', 'move')
    expect(r.applied).toBe(2)
    expect(transferItems).toHaveBeenCalledWith(['/a/x', '/a/y'], '/b', 'move')
  })

  it('falls back to per-op copy/move when the batch command errors', async () => {
    ;(transferItems as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('no cmd'))
    ;(moveFile as ReturnType<typeof vi.fn>).mockClear()
    const r = await transferBatch(['/a/x'], '/b', 'move')
    expect(r.applied).toBe(1)
    expect(moveFile).toHaveBeenCalledWith('/a/x', '/b/x')
  })

  it('no-ops on empty input', async () => {
    expect(await transferBatch([], '/b', 'copy')).toEqual({ applied: 0, failures: [] })
  })
})
