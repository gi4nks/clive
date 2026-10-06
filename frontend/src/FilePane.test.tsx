// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import i18n from './i18n'
import { FilePane, type PaneId, type PaneState } from './FilePane'
import type { FileEntry } from './api'

beforeEach(async () => {
  cleanup()
  await i18n.changeLanguage('it')
})

const files: FileEntry[] = [
  { name: 'docs', path: '/home/me/docs', isDir: true, size: 0, modified: 0, extension: null },
  { name: 'a.txt', path: '/home/me/a.txt', isDir: false, size: 3, modified: 0, extension: 'txt' },
]
const pane: PaneState = { path: '/home/me', entries: files, selected: new Set(['/home/me/a.txt']), anchorPath: null, renamingPath: null, query: '', loading: false }

function setup() {
  const props = {
    id: 'left' as PaneId,
    pane,
    files,
    active: false,
    view: 'list' as const,
    sort: { key: 'name' as const, dir: 1 as const },
    home: '/home/me',
    recents: ['/home/me/Downloads'],
    pinned: [],
    onActivate: vi.fn(),
    onNavigate: vi.fn(),
    onItemClick: vi.fn(),
    onOpen: vi.fn(),
    onContextMenu: vi.fn(),
    onRenameConfirm: vi.fn(),
    onRenameCancel: vi.fn(),
    onSortChange: vi.fn(),
    dragPayload: vi.fn(() => JSON.stringify(['/home/me/a.txt'])),
    onDropTransfer: vi.fn(),
    onDropToDir: vi.fn(),
  }
  render(<FilePane {...props} />)
  return props
}

const dt = (payload: unknown) => ({
  dataTransfer: { getData: () => JSON.stringify(payload), setData() {}, dropEffect: '' },
})

describe('FilePane', () => {
  it('activates the pane on pointer down', () => {
    const p = setup()
    fireEvent.pointerDown(screen.getByRole('region'))
    expect(p.onActivate).toHaveBeenCalledWith('left')
  })

  it('routes row interactions with the pane id', () => {
    const p = setup()
    const row = screen.getByText('a.txt')
    fireEvent.click(row, { metaKey: false, ctrlKey: false, shiftKey: false })
    expect(p.onItemClick).toHaveBeenCalledWith('left', expect.objectContaining({ name: 'a.txt' }), expect.anything())
    fireEvent.doubleClick(row)
    expect(p.onOpen).toHaveBeenCalledWith('left', expect.objectContaining({ name: 'a.txt' }))
  })

  it('opens the per-pane Go-to menu and navigates to a place', () => {
    const p = setup()
    fireEvent.click(screen.getByTitle('Vai a…'))
    fireEvent.click(screen.getByText('Scaricati'))
    expect(p.onNavigate).toHaveBeenCalledWith('left', '/home/me/Downloads')
  })

  it('navigates to a folder by clicking a breadcrumb segment', () => {
    const p = setup()
    fireEvent.click(screen.getByText('home'))
    expect(p.onNavigate).toHaveBeenCalledWith('left', '/home')
  })

  it('handles a drop on the pane body via onDropTransfer', () => {
    const p = setup()
    fireEvent.drop(screen.getByRole('region'), dt(['/home/me/x.png']))
    expect(p.onDropTransfer).toHaveBeenCalledWith('left', ['/home/me/x.png'], false)
  })

  it('handles a drop on a Go-to item via onDropToDir (4.4)', () => {
    const p = setup()
    fireEvent.click(screen.getByTitle('Vai a…'))
    fireEvent.drop(screen.getByText('Scaricati'), dt(['/home/me/x.png']))
    expect(p.onDropToDir).toHaveBeenCalledWith('/home/me/Downloads', ['/home/me/x.png'], false)
  })
})
