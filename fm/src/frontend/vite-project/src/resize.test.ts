import { describe, it, expect } from 'vitest'
import { clampWidth, collapsePane, railLabel, SIDEBAR_MIN, SIDEBAR_MAX } from './resize'

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
