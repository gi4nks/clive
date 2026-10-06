import { describe, it, expect } from 'vitest'
import { rectsIntersect, marqueePaths, rangePaths, stepRange } from './selection'

describe('rectsIntersect', () => {
  it('overlapping boxes', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true)
  })
  it('disjoint boxes', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 })).toBe(false)
  })
  it('touching edges do not count', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false)
  })
})

describe('marqueePaths', () => {
  const items = [
    { path: '/a', rect: { x: 0, y: 0, w: 100, h: 20 } },
    { path: '/b', rect: { x: 0, y: 30, w: 100, h: 20 } },
    { path: '/c', rect: { x: 0, y: 60, w: 100, h: 20 } },
  ]
  it('selects rows the box crosses', () => {
    expect(marqueePaths(items, { x: 10, y: 5, w: 5, h: 40 })).toEqual(['/a', '/b'])
  })
  it('empty box selects nothing', () => {
    expect(marqueePaths(items, { x: 0, y: 0, w: 0, h: 0 })).toEqual([])
  })
})

describe('rangePaths', () => {
  const p = ['a', 'b', 'c', 'd']
  it('inclusive both directions', () => {
    expect(rangePaths(p, 'b', 'd')).toEqual(['b', 'c', 'd'])
    expect(rangePaths(p, 'd', 'b')).toEqual(['b', 'c', 'd'])
  })
  it('missing anchor yields empty', () => {
    expect(rangePaths(p, 'x', 'b')).toEqual([])
  })
})

describe('stepRange', () => {
  const p = ['a', 'b', 'c', 'd']
  it('no anchor: first arrow selects the row (becomes new pivot)', () => {
    expect(stepRange(p, null, new Set(), 1)).toEqual({ path: 'a', range: ['a'] })
  })
  it('extends from the far edge in the pressed direction', () => {
    const r = stepRange(p, 'a', new Set(['a', 'b']), 1)
    expect(r!.path).toBe('c')
    expect(r!.range).toEqual(['a', 'b', 'c'])
  })
  it('shrinks back keeping the pivot', () => {
    const r = stepRange(p, 'a', new Set(['a', 'b', 'c']), -1)
    expect(r!.path).toBe('b')
    expect(r!.range).toEqual(['a', 'b'])
  })
  it('clamps at both ends', () => {
    expect(stepRange(p, 'c', new Set(['c']), 1)!.path).toBe('d')
    expect(stepRange(p, 'c', new Set(['c']), -1)!.path).toBe('b')
    expect(stepRange(p, 'a', new Set(['a']), -1)!.path).toBe('a')
  })
  it('first/last jump to edges', () => {
    expect(stepRange(p, 'b', new Set(['b']), 'last')!.range).toEqual(['b', 'c', 'd'])
    expect(stepRange(p, 'c', new Set(['c']), 'first')!.range).toEqual(['a', 'b', 'c'])
  })
})
