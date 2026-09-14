import { describe, it, expect } from 'vitest'
import { placesFor, pinPath, unpinPath, reorderPinned, pinnedLabel, MAX_PINNED } from './pinned'

describe('placesFor', () => {
  it('is empty without a home and lists standard folders otherwise', () => {
    expect(placesFor('')).toEqual([])
    const p = placesFor('/home/u')
    expect(p[0]).toEqual({ labelKey: 'home', path: '/home/u' })
    expect(p.find((x) => x.labelKey === 'downloads')?.path).toBe('/home/u/Downloads')
  })
})

describe('pinned list ops', () => {
  it('adds, ignores duplicates, and caps at MAX', () => {
    let pinned: string[] = []
    pinned = pinPath(pinned, '/a')
    pinned = pinPath(pinned, '/a')
    expect(pinned).toEqual(['/a'])
    const big = Array.from({ length: MAX_PINNED }, (_, i) => `/p${i}`)
    expect(pinPath(big, '/extra').length).toBe(MAX_PINNED)
    expect(pinPath(big, '/extra')).not.toContain('/extra')
  })

  it('removes', () => {
    expect(unpinPath(['/a', '/b', '/c'], '/b')).toEqual(['/a', '/c'])
  })

  it('reorders (forward and backward), clamping the target index', () => {
    const p = ['/a', '/b', '/c', '/d']
    expect(reorderPinned(p, '/a', 2)).toEqual(['/b', '/c', '/a', '/d'])
    expect(reorderPinned(p, '/d', 0)).toEqual(['/d', '/a', '/b', '/c'])
    expect(reorderPinned(p, '/x', 1)).toEqual(p) // unknown → unchanged
    expect(reorderPinned(p, '/a', 999)).toEqual(['/b', '/c', '/d', '/a'])
  })

  it('labels by basename, ignoring trailing slash', () => {
    expect(pinnedLabel('/home/u/photos')).toBe('photos')
    expect(pinnedLabel('/home/u/notes.txt')).toBe('notes.txt')
  })
})
