import { describe, it, expect } from 'vitest'
import { isArchivePath, splitArchivePath, joinArchivePath, archiveParent, archiveBasename, isInsideArchive, archiveRealPath, listArchiveEntries, ARCHIVE_SEP } from './archivePath'

describe('archivePath codec', () => {
  it('detects and splits', () => {
    expect(isArchivePath(`/d/backup.zip${ARCHIVE_SEP}a/b.txt`)).toBe(true)
    expect(isArchivePath('/d/backup.zip')).toBe(false)
    expect(splitArchivePath('/d/b.zip!/x/y')).toEqual({ archive: '/d/b.zip', inner: 'x/y' })
    expect(splitArchivePath('/d/b.zip!/')?.inner).toBe('')
  })
  it('joins round-trips', () => {
    const p = joinArchivePath('/d/b.zip', 'fotos/2026')
    expect(p).toBe('/d/b.zip!/fotos/2026')
    expect(splitArchivePath(p)).toEqual({ archive: '/d/b.zip', inner: 'fotos/2026' })
  })
  it('parent walks up and exits the archive', () => {
    expect(archiveParent('/d/b.zip!/a/b')).toBe('/d/b.zip!/a')
    expect(archiveParent('/d/b.zip!/a')).toBe('/d/b.zip')
    expect(archiveParent('/d/x/y')).toBe('/d/x')
  })
  it('basename: inner file, archive root shows zip name', () => {
    expect(archiveBasename('/d/b.zip!/dir/file.md')).toBe('file.md')
    expect(archiveBasename('/d/b.zip!/')).toBe('b.zip')
  })
  it('inside-only flag: root of archive is already read-only', () => {
    expect(isInsideArchive('/d/b.zip!/')).toBe(true)
    expect(isInsideArchive('/d/b.zip')).toBe(false)
  })
})

describe('listArchiveEntries', () => {
  const members = [
    { name: 'a.txt', isDir: false, size: 3, modified: 1 },
    { name: 'docs/b.md', isDir: false, size: 5, modified: 2 },
    { name: 'docs/x/c.md', isDir: false, size: 7, modified: 3 },
    { name: 'imgs/', isDir: true, size: 0, modified: 4 },
  ]
  it('folds root listing into files + aggregated dirs', () => {
    const { rows } = listArchiveEntries('/d/z.zip', '', members)
    const names = rows.map((r) => r.name).sort()
    expect(names).toEqual(['a.txt', 'docs', 'imgs'])
    const docs = rows.find((r) => r.name === 'docs')!
    expect(docs.isDir).toBe(true)
    expect(docs.size).toBe(12)
    expect(docs.path).toBe('/d/z.zip!/docs')
    const img = rows.find((r) => r.name === 'imgs')!
    expect(img.isDir).toBe(true)
  })
  it('nests and hides non-matching members', () => {
    const { rows } = listArchiveEntries('/d/z.zip', 'docs', members)
    expect(rows.map((r) => r.name).sort()).toEqual(['b.md', 'x'])
    expect(rows.find((r) => r.name === 'b.md')!.extension).toBe('md')
  })
  it('real path of pseudo is the archive', () => {
    expect(archiveRealPath('/d/z.zip!/a/b')).toBe('/d/z.zip')
    expect(archiveRealPath('/d/plain.txt')).toBe('/d/plain.txt')
  })
})
