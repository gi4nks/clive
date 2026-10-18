// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import i18n from './i18n'
import { FilePane } from './FilePane'
import type { PaneState } from './FilePane'
import type { FileEntry } from './api'

const pane = (path: string, entries: FileEntry[] = []): PaneState => ({ path, entries, selected: new Set(), anchorPath: null, renamingPath: null, query: '', loading: false })
const entry: FileEntry = { name: 'notes.txt', path: '/Users/test/notes.txt', isDir: false, size: 2, modified: 0, extension: 'txt' }
const makeProps = (over: Record<string, unknown> = {}) => ({
  id: 'left' as const, pane: pane('/Users/test/Projects'), files: [entry], active: true, view: 'list' as const,
  sort: { key: 'name' as const, dir: 1 as const }, home: '/Users/test', recents: ['/tmp/recent'], pinned: ['/tmp/favourite'],
  onActivate: vi.fn(), onCollapse: vi.fn(), onNavigate: vi.fn(), onItemClick: vi.fn(), onOpen: vi.fn(), onContextMenu: vi.fn(),
  onRenameConfirm: vi.fn(), onRenameCancel: vi.fn(), onSortChange: vi.fn(), dragPayload: vi.fn(() => ''),
  onDropTransfer: vi.fn(), onDropToDir: vi.fn(), onMarquee: vi.fn(), ...over,
})

beforeEach(async () => { await i18n.changeLanguage('en') })
afterEach(cleanup)

describe('FilePane', () => {
  it('navigates through breadcrumbs, places, pins, recents, and collapse', () => {
    const props = makeProps()
    render(<FilePane {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }))
    expect(props.onNavigate).toHaveBeenCalledWith('left', '/Users/test/Projects')
    fireEvent.click(screen.getByTitle('Go to…'))
    fireEvent.click(screen.getByRole('button', { name: 'Parent folder' }))
    fireEvent.click(screen.getByTitle('Go to…'))
    fireEvent.click(screen.getByTitle('/tmp/favourite'))
    fireEvent.click(screen.getByTitle('Go to…'))
    fireEvent.click(screen.getByTitle('/tmp/recent'))
    fireEvent.click(screen.getByTitle('Collapse pane'))
    expect(props.onCollapse).toHaveBeenCalledWith('left')
    expect(props.onNavigate).toHaveBeenCalledWith('left', '/tmp/recent')
  })

  it('handles pane and breadcrumb drops and ignores malformed payloads', () => {
    const props = makeProps()
    const { container } = render(<FilePane {...props} />)
    const region = screen.getByRole('region')
    const transfer = { dataTransfer: { getData: () => JSON.stringify(['/tmp/file']) } }
    fireEvent.drop(region, transfer)
    expect(props.onDropTransfer).toHaveBeenCalledWith('left', ['/tmp/file'], false)
    fireEvent.drop(screen.getByRole('button', { name: 'test' }), transfer)
    expect(props.onDropToDir).toHaveBeenCalledWith('/Users/test', ['/tmp/file'], false)
    const callsBeforeInvalid = vi.mocked(props.onDropTransfer).mock.calls.length
    fireEvent.drop(region, { dataTransfer: { getData: () => '{invalid' } })
    expect(props.onDropTransfer).toHaveBeenCalledTimes(callsBeforeInvalid)
    expect(container.querySelector('[data-file-path]')).toBeInTheDocument()
  })

  it('renders archive breadcrumbs and navigates to archive root and nested members', () => {
    const props = makeProps({ pane: pane('/Users/test/archive.zip!/docs/readme.md'), files: [] })
    render(<FilePane {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'archive.zip' }))
    expect(props.onNavigate).toHaveBeenCalledWith('left', '/Users/test/archive.zip!/')
    fireEvent.click(screen.getByRole('button', { name: 'docs' }))
    expect(props.onNavigate).toHaveBeenCalledWith('left', '/Users/test/archive.zip!/docs')
  })

  it('shows loading without an empty listing and activates on pointer interaction', () => {
    const props = makeProps({ files: [], pane: { ...pane('/Users/test'), loading: true }, active: false })
    render(<FilePane {...props} />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('region'))
    expect(props.onActivate).toHaveBeenCalledWith('left')
  })

  it('offers each standard place in the navigation menu', () => {
    const props = makeProps()
    render(<FilePane {...props} />)
    fireEvent.click(screen.getByTitle('Go to…'))
    for (const [label, path] of [['Home', '/Users/test'], ['Desktop', '/Users/test/Desktop'], ['Documents', '/Users/test/Documents'], ['Downloads', '/Users/test/Downloads'], ['Pictures', '/Users/test/Pictures'], ['Music', '/Users/test/Music']]) {
      fireEvent.click(screen.getByRole('button', { name: label }))
      expect(props.onNavigate).toHaveBeenLastCalledWith('left', path)
      fireEvent.click(screen.getByTitle('Go to…'))
    }
  })
})
