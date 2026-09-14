// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FileIcon } from './FileIcon'
import type { FileEntry } from './api'

const e = (over: Partial<FileEntry>): FileEntry => ({
  name: 'x', path: '/x', isDir: false, size: 1, modified: 0, extension: null, ...over,
})

const label = (entry: FileEntry) => {
  const { unmount } = render(<FileIcon entry={entry} />)
  const l = screen.getByRole('img').getAttribute('aria-label')
  unmount()
  return l
}

describe('FileIcon kind mapping', () => {
  it('folder', () => expect(label(e({ name: 'sub', isDir: true, path: '/sub' }))).toBe('folder'))
  it('downloads folder', () => expect(label(e({ name: 'Downloads', isDir: true, path: '/h/Downloads' }))).toBe('downloads'))
  it('pdf', () => expect(label(e({ name: 'a.pdf', extension: 'pdf' }))).toBe('pdf'))
  it('typescript → code', () => expect(label(e({ name: 'main.ts', extension: 'ts' }))).toBe('code'))
  it('image', () => expect(label(e({ name: 'p.heic', extension: 'heic' }))).toBe('image'))
  it('archive', () => expect(label(e({ name: 'x.zip', extension: 'zip' }))).toBe('archive'))
  it('unknown → file', () => expect(label(e({ name: 'notes', extension: 'zzz' }))).toBe('file'))
})
