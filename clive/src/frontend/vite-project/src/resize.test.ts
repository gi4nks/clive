import { describe, it, expect } from 'vitest'
import { clampSplitPct, clampWidth, collapsePane, railLabel, fitColWidths, SIDEBAR_MIN, SIDEBAR_MAX, COL_MIN, DATE_COL_MIN, LIST_GRID_OVERHEAD } from './resize'

describe('clampWidth', () => {
  it('passes values inside range', () => expect(clampWidth(220)).toBe(220))
  it('clamps below min', () => expect(clampWidth(10)).toBe(SIDEBAR_MIN))
  it('clamps above default max', () => expect(clampWidth(9999)).toBe(SIDEBAR_MAX))
  it('honors custom max', () => expect(clampWidth(400, 160, 300)).toBe(300))
  it('NaN/Infinity → min (safe default)', () => {
    expect(clampWidth(NaN)).toBe(SIDEBAR_MIN)
    expect(clampWidth(Infinity)).toBe(SIDEBAR_MIN)
  })
})

describe('collapsePane', () => {
  const both = { left: false, right: false }
  const L = { left: true, right: false }
  const R = { left: false, right: true }
  it('collapses target when other is expanded', () => expect(collapsePane(both, 'left')).toEqual(L))
  it('refuses if that would leave zero expanded', () => expect(collapsePane(R, 'left')).toEqual(R))
  it('expands when already collapsed', () => expect(collapsePane(L, 'left')).toEqual(both))
})

describe('railLabel', () => {
  it('Home when equals home', () => expect(railLabel('/u/x', '/u/x')).toBe('Home'))
  it('basename for subdir', () => expect(railLabel('/u/x/Downloads/', '/u/x')).toBe('Downloads'))
  it('root', () => expect(railLabel('/', '/u/x')).toBe('/'))
  it('empty path', () => expect(railLabel('', '/u')).toBe(''))
})

describe('fitColWidths', () => {
  const budget = (avail: number) => avail - LIST_GRID_OVERHEAD - DATE_COL_MIN
  it('keeps widths untouched when they fit', () =>
    expect(fitColWidths(1200, 676.71, 87.07)).toEqual({ name: 676.71, size: 87.07 }))
  it('shrinks proportionally when pane is narrower than the columns', () => {
    const r = fitColWidths(540, 676.71, 87.07)
    expect(r.name + r.size).toBeLessThanOrEqual(budget(540) + 0.01)
    expect(r.name).toBeLessThan(676.71)
    expect(r.name).toBeGreaterThanOrEqual(COL_MIN)
    expect(r.size).toBeGreaterThanOrEqual(COL_MIN)
    expect(r.name / r.size).toBeLessThanOrEqual(676.71 / 87.07)
  })
  it('floors both columns at COL_MIN in a very narrow pane', () =>
    expect(fitColWidths(200, 676.71, 87.07)).toEqual({ name: COL_MIN, size: COL_MIN }))
  it('is a no-op for unknown width (0/NaN)', () => {
    expect(fitColWidths(0, 300, 100)).toEqual({ name: 300, size: 100 })
    expect(fitColWidths(NaN, 300, 100)).toEqual({ name: 300, size: 100 })
  })
  it('never grows columns beyond their configured width', () => {
    const r = fitColWidths(400, 100, 50)
    expect(r.name).toBe(100)
    expect(r.size).toBe(50)
  })
})

describe('clampSplitPct', () => {
  it('keeps both panes at least PANE_MIN wide', () => {
    expect(clampSplitPct(1000, 0.02)).toBeCloseTo(320 / 1000, 5)
    expect(clampSplitPct(1000, 0.98)).toBeCloseTo(1 - 320 / 1000, 5)
    expect(clampSplitPct(1000, 0.5)).toBe(0.5)
  })
  it('respects the 0.15 floor on very wide containers', () => {
    expect(clampSplitPct(10000, 0.01)).toBe(0.15)
  })
  it('centers when the container cannot fit two panes', () => {
    expect(clampSplitPct(500, 0.9)).toBe(0.5)
    expect(clampSplitPct(0, 0.3)).toBe(0.5)
  })
})
