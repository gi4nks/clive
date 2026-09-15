import { describe, it, expect } from 'vitest'
import { isArchivePath, splitArchivePath, joinArchivePath, archiveParent, archiveBasename, isInsideArchive, ARCHIVE_SEP } from './archivePath'

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
