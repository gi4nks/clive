import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getChildCount, invalidateChildCount } from './childCount.js'
import * as api from './api.js'

vi.mock('./api.js', () => ({ listDir: vi.fn() }))

const listDirMock = api.listDir as unknown as ReturnType<typeof vi.fn>

function mkEntries(files: number, dirs: number): api.FileEntry[] {
  const out: api.FileEntry[] = []
  for (let i = 0; i < files; i++) out.push({ name: `f${i}`, path: `/p/f${i}`, isDir: false, size: 1, modified: 0, extension: null })
  for (let i = 0; i < dirs; i++) out.push({ name: `d${i}`, path: `/p/d${i}`, isDir: true, size: 0, modified: 0, extension: null })
  return out
}

beforeEach(() => {
  listDirMock.mockReset()
  invalidateChildCount()
})

describe('getChildCount', () => {
  it('counts all first-level entries and detects subdirs', async () => {
    listDirMock.mockResolvedValueOnce(mkEntries(3, 2))
    const r = await getChildCount('/p')
    expect(r).toEqual({ state: 'ok', total: 5, hasSubdirs: true })
  })

  it('marks folders without subdirs as hasSubdirs=false', async () => {
    listDirMock.mockResolvedValueOnce(mkEntries(7, 0))
    const r = await getChildCount('/p')
    expect(r).toEqual({ state: 'ok', total: 7, hasSubdirs: false })
  })

  it('empty folder resolves to {0, false}', async () => {
    listDirMock.mockResolvedValueOnce([])
    const r = await getChildCount('/p')
    expect(r).toEqual({ state: 'ok', total: 0, hasSubdirs: false })
  })

  it('caches results so the second call is not a new fetch', async () => {
    listDirMock.mockResolvedValueOnce(mkEntries(2, 0))
    await getChildCount('/p')
    await getChildCount('/p')
    await getChildCount('/p')
    expect(listDirMock).toHaveBeenCalledTimes(1)
  })

  it('deduplicates concurrent calls for the same path', async () => {
    let resolve!: (v: api.FileEntry[]) => void
    listDirMock.mockImplementationOnce(() => new Promise((r) => { resolve = r }))
    const p1 = getChildCount('/p')
    const p2 = getChildCount('/p')
    const p3 = getChildCount('/p')
    resolve(mkEntries(1, 0))
    const [r1, r2, r3] = await Promise.all([p1, p2, p3])
    expect(listDirMock).toHaveBeenCalledTimes(1)
    expect(r1).toEqual(r2)
    expect(r2).toEqual(r3)
  })

  it('surfaces listDir rejection as {state: "error"} and caches it', async () => {
    listDirMock.mockRejectedValueOnce(new Error('EACCES'))
    const r = await getChildCount('/secret')
    expect(r).toEqual({ state: 'error' })
    await getChildCount('/secret')
    expect(listDirMock).toHaveBeenCalledTimes(1)
  })
})

describe('invalidateChildCount', () => {
  it('no-arg clears all cached + inflight state', async () => {
    listDirMock.mockResolvedValue(mkEntries(1, 0))
    await getChildCount('/a')
    await getChildCount('/b')
    expect(listDirMock).toHaveBeenCalledTimes(2)
    invalidateChildCount()
    await getChildCount('/a')
    await getChildCount('/b')
    expect(listDirMock).toHaveBeenCalledTimes(4)
  })

  it('drops only the target path and its descendants', async () => {
    listDirMock.mockResolvedValue(mkEntries(1, 0))
    await getChildCount('/x')
    await getChildCount('/x/inner')
    await getChildCount('/y')
    invalidateChildCount('/x')
    await getChildCount('/x')       // refetch
    await getChildCount('/x/inner') // refetch
    await getChildCount('/y')       // still cached
    expect(listDirMock).toHaveBeenCalledTimes(5)
  })

  it('treats root path "/" without a double-slash prefix', async () => {
    listDirMock.mockResolvedValue(mkEntries(1, 0))
    await getChildCount('/a')
    await getChildCount('/b')
    invalidateChildCount('/')
    await getChildCount('/a')
    expect(listDirMock).toHaveBeenCalledTimes(3)
  })
})
