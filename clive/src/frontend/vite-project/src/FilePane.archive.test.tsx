// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import i18n from './i18n'
import { FilePane, type PaneState } from './FilePane'
import type { FileEntry } from './api'

vi.mock('./ChildCountBadge', () => ({ ChildCountBadge: () => <span data-testid="cc" /> }))
vi.mock('./api', async (io) => ({ ...(await io<typeof import('./api')>()), listDir: async () => [] }))

const entry = (name: string, path: string, isDir = false): FileEntry =>
  ({ name, path, isDir, size: 1, modified: 0, extension: null })

const pane = (path: string, entries: FileEntry[]): PaneState =>
  ({ path, entries, selected: new Set(), anchorPath: null, renamingPath: null, query: '', loading: false })

const renderPane = (p: PaneState) =>
  render(
    <FilePane
      id="left"
      pane={p}
      files={p.entries}
      active
      view="list"
      sort={{ key: 'name', dir: 1 }}
      home="/home/u"
      recents={[]}
      pinned={[]}
      onActivate={vi.fn()}
      onNavigate={vi.fn()}
      onItemClick={vi.fn()}
      onOpen={vi.fn()}
      onContextMenu={vi.fn()}
      onRenameConfirm={vi.fn()}
      onRenameCancel={vi.fn()}
      onSortChange={vi.fn()}
      dragPayload={vi.fn(() => '')}
      onDropTransfer={vi.fn()}
      onDropToDir={vi.fn()}
    />,
  )

beforeEach(async () => {
  cleanup()
  await i18n.changeLanguage('en')
})
afterEach(() => cleanup())

describe('FilePane inside archive', () => {
  it('shows the real path plus badge and inner crumbs, navigating on crumb click', async () => {
    const onNavigate = vi.fn()
    const p = { ...pane('/home/u/backup.zip!/fotos/2026', [entry('g.txt', '/home/u/backup.zip!/fotos/2026/g.txt')]), } as PaneState
    render(
      <FilePane
        id="left" pane={p} files={p.entries} active view="list" sort={{ key: 'name', dir: 1 }}
        home="/home/u" recents={[]} pinned={[]} onActivate={vi.fn()} onNavigate={onNavigate}
        onItemClick={vi.fn()} onOpen={vi.fn()} onContextMenu={vi.fn()} onRenameConfirm={vi.fn()}
        onRenameCancel={vi.fn()} onSortChange={vi.fn()} dragPayload={vi.fn(() => '')}
        onDropTransfer={vi.fn()} onDropToDir={vi.fn()}
      />,
    )
    await waitFor(() => expect(screen.getByText('Archive')).toBeInTheDocument())
    expect(screen.getByText('backup.zip')).toBeInTheDocument()
    fireEvent.click(screen.getByText('2026'))
    expect(onNavigate).toHaveBeenCalledWith('left', '/home/u/backup.zip!/fotos/2026')
    fireEvent.click(screen.getByText('backup.zip'))
    expect(onNavigate).toHaveBeenCalledWith('left', '/home/u/backup.zip!/')
  })
  it('double-click on zip file enters it (onOpen routing handled in App, entry rendered here)', () => {
    renderPane(pane('/home/u', [entry('backup.zip', '/home/u/backup.zip')]))
    expect(screen.getByText('backup.zip')).toBeInTheDocument()
  })
})
