import { describe, it, expect } from 'vitest'
import { computeRows, expandPattern, type RenameSource } from './renamePattern'

const src = (name: string, mod = 1757000000, isDir = false): RenameSource => ({ name, isDir, modified: mod })
const opts = (pattern: string, over: object = {}) => ({ pattern, find: '', replace: '', useRegex: false, startIndex: 1, ...over })

describe('expandPattern', () => {
  it('expands name/ext/counter tokens', () => {
    expect(expandPattern('{name}_1.{ext}', src('photo.JPG'))).toBe('photo_1.JPG')
    expect(expandPattern('IMG_{n>3}.{ext}', src('a.png'))).toBe('IMG_001.png')
    expect(expandPattern('{n}', src('a.png'), 12)).toBe('12')
  })
  it('case variants and title', () => {
    expect(expandPattern('{NAME}', src('holiday photo.jpg'))).toBe('HOLIDAY PHOTO')
    expect(expandPattern('{name_lower}', src('Holiday Photo'))).toBe('holiday photo')
    expect(expandPattern('{Title}', src('holiday photo'))).toBe('Holiday Photo')
  })
  it('date tokens (local time)', () => {
    expect(expandPattern('{date}', src('x'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(expandPattern('{date:YYYYMMDD}', src('x'))).toMatch(/^\d{8}$/)
  })
  it('directories have no ext', () => {
    expect(expandPattern('{name}.{ext}', src('stuff', 0, true))).toBe('stuff.')
  })
})

describe('computeRows', () => {
  const files = [src('a.txt'), src('b.txt'), src('c.txt')]
  it('produces one row per source, enabled, ok', () => {
    const rows = computeRows(files, opts('{name}.{ext}'))
    expect(rows.map((r) => r.target)).toEqual(['a.txt', 'b.txt', 'c.txt'])
    expect(rows.every((r) => r.ok && r.enabled)).toBe(true)
  })
  it('marks duplicate targets', () => {
    const rows = computeRows(files, opts('same.{ext}'))
    expect(rows.filter((r) => r.ok)).toHaveLength(1)
    expect(rows[1].reason).toBe('dup')
  })
  it('marks invalid names (slashes) and empties', () => {
    const rows = computeRows([src('ok')], opts('a/b{name}'))
    expect(rows[0].ok).toBe(false)
    expect(rows[0].reason).toBe('invalid')
  })
  it('find/replace literal then regex', () => {
    const lit = computeRows(files, opts('{name}.{ext}', { find: '.txt', replace: '.md' }))
    expect(lit.map((r) => r.target)).toEqual(['a.md', 'b.md', 'c.md'])
    const re = computeRows([src('IMG_0042.png')], opts('{name}.{ext}', { find: '#IMG_(\\d+)$#', replace: 'photo-{$1}', useRegex: true }))
    expect(re[0].target).toBe('IMG_0042.png') // anchored on full target incl. ext → no match
    const re2 = computeRows([src('IMG_0042.png')], opts('{name}.{ext}', { find: '#^IMG_(\\d+)#', replace: 'photo-{$1}', useRegex: true }))
    expect(re2[0].target).toBe('photo-0042.png')
  })
  it('bad regex flags every row', () => {
    const rows = computeRows(files, opts('{name}', { find: '#(#', replace: 'x', useRegex: true }))
    expect(rows.every((r) => !r.ok && r.reason === 'regex')).toBe(true)
  })
})
