// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FileIcon } from './FileIcon'
import type { FileEntry } from './api'

const e = (over: Partial<FileEntry>): FileEntry => ({
  name: 'x', path: '/x', isDir: false, size: 1, modified: 0, extension: null, ...over,
})

const label = (entry: FileEntry) => {
  const { unmount, container } = render(<FileIcon entry={entry} />)
  const l = container.querySelector('svg')?.getAttribute('aria-label')
  unmount()
  return l
}

describe('FileIcon kind mapping', () => {
  it('folder', () => expect(label(e({ name: 'sub', isDir: true, path: '/sub' }))).toBe('folder'))
  it('downloads folder', () => expect(label(e({ name: 'Downloads', isDir: true, path: '/h/Downloads' }))).toBe('downloads'))
  it('maps named macOS folders to their dedicated folder kinds', () => {
    const folders = [
      ['Desktop', 'desktop'], ['Documents', 'documents'], ['Pictures', 'pictures'],
      ['Music', 'music'], ['Movies', 'movies'], ['Applications', 'applications'], ['Library', 'library'],
    ] as const
    for (const [name, kind] of folders) expect(label(e({ name, isDir: true, path: `/h/${name}` }))).toBe(kind)
  })
  it('pdf', () => expect(label(e({ name: 'a.pdf', extension: 'pdf' }))).toBe('pdf'))
  it('typescript → code', () => expect(label(e({ name: 'main.ts', extension: 'ts' }))).toBe('code'))
  it('image', () => expect(label(e({ name: 'p.heic', extension: 'heic' }))).toBe('image'))
  it('archive', () => expect(label(e({ name: 'x.zip', extension: 'zip' }))).toBe('archive'))
  it('unknown → file', () => expect(label(e({ name: 'notes', extension: 'zzz' }))).toBe('file'))

  it('infers distinctive artwork from the filename when the backend omits extension', () => {
    expect(label(e({ name: '01 KS 1Ed 1.jpg', extension: null }))).toBe('image')
    expect(label(e({ name: 'Swimrankings.html', extension: null }))).toBe('code')
    expect(label(e({ name: 'Return_documents.pdf', extension: null }))).toBe('pdf')
    expect(label(e({ name: 'README', extension: null }))).toBe('file')
  })

  it('recognizes a zipped macOS app bundle by its bundle name', () => {
    expect(label(e({ name: 'Clive.app', extension: 'zip' }))).toBe('app')
  })

  it('renders Clive-owned vector artwork instead of an OS image or colored tile', () => {
    const { container } = render(<FileIcon entry={e({ name: 'report.pdf', extension: 'pdf' })} />)
    const icon = screen.getByRole('img')
    expect(icon.tagName.toLowerCase()).toBe('svg')
    expect(icon).toHaveAttribute('data-icon-kind', 'pdf')
    expect(container.querySelector('img')).toBeNull()
    expect(icon.querySelector('rect[width="22"][height="22"]')).toBeNull()
  })

  it('uses a near full-size icon in card mode', () => {
    const { container } = render(<FileIcon entry={e({ name: 'report.pdf', extension: 'pdf' })} size="card" />)
    expect(container.querySelector('svg')).toHaveClass('h-[76px]', 'w-[76px]')
    expect(container.firstElementChild).toHaveClass('h-20', 'w-20')
  })

  it('makes category marks prominent and keeps category artwork distinct', () => {
    const { container, rerender } = render(<FileIcon entry={e({ name: 'report.pdf', extension: 'pdf' })} size="card" />)
    const pdfArt = container.querySelector('svg')?.innerHTML
    rerender(<FileIcon entry={e({ name: 'main.ts', extension: 'ts' })} size="card" />)
    const codeArt = container.querySelector('svg')?.innerHTML
    expect(pdfArt).toContain('PDF')
    expect(codeArt).toContain('#3d5369')
    expect(pdfArt).not.toEqual(codeArt)
  })

  it('gives each common file category its own visible artwork', () => {
    const cases: Array<[string, string]> = [
      ['report.pdf', 'pdf'], ['main.ts', 'code'], ['budget.csv', 'sheet'],
      ['deck.pptx', 'slides'], ['photo.jpg', 'image'], ['clip.mp4', 'video'],
      ['song.mp3', 'audio'], ['backup.zip', 'archive'], ['Clive.app', 'app'],
      ['secret.pem', 'key'], ['type.woff2', 'font'], ['settings.toml', 'config'],
      ['data.json', 'data'], ['runner.exe', 'executable'], ['letter.docx', 'doc'],
      ['readme.md', 'markdown'], ['notes.txt', 'text'],
    ]
    const artwork = new Set<string>()
    for (const [name, kind] of cases) {
      const { container, unmount } = render(<FileIcon entry={e({ name, extension: name.split('.').pop() ?? null })} size="card" />)
      const icon = container.querySelector('svg')!
      expect(icon).toHaveAttribute('data-icon-kind', kind)
      expect(icon.innerHTML.length).toBeGreaterThan(80)
      artwork.add(icon.innerHTML)
      unmount()
    }
    expect(artwork.size).toBe(cases.length)
  })

  it('covers less common file formats and directory aliases', () => {
    const files: Array<[string, string]> = [
      ['clip.mkv', 'video'], ['track.aiff', 'audio'], ['disk.dmg', 'archive'],
      ['table.ods', 'sheet'], ['talk.odp', 'slides'], ['source.swift', 'code'],
      ['config.editorconfig', 'config'], ['rows.ndjson', 'data'], ['install.bin', 'executable'],
      ['certificate.crt', 'key'], ['trace.log', 'text'], ['Project.app', 'app'],
    ]
    for (const [name, kind] of files) expect(label(e({ name, extension: name.split('.').pop() ?? null }))).toBe(kind)
    expect(label(e({ name: 'Photos', isDir: true, path: '/h/Photos' }))).toBe('pictures')
    expect(label(e({ name: 'Docs', isDir: true, path: '/h/Docs' }))).toBe('documents')
    expect(label(e({ name: 'Videos', isDir: true, path: '/h/Videos' }))).toBe('movies')
  })
})
