// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import i18n from './i18n'
import { Sidebar } from './Sidebar'
import { ConfirmDialog } from './ConfirmDialog'

const volumeMock = vi.hoisted(() => ({
  volumes: [
    { name: 'Macintosh HD', mountPoint: '/', device: 'disk1', totalBytes: 1000, usedBytes: 700, freeBytes: 300, kind: 'internal', ejectable: false },
    { name: 'Backup', mountPoint: '/Volumes/Backup', device: 'disk4', totalBytes: 2000, usedBytes: 500, freeBytes: 1500, kind: 'external', ejectable: true },
    { name: 'NAS', mountPoint: '/Volumes/NAS', device: 'smb', totalBytes: 3000, usedBytes: 1000, freeBytes: 2000, kind: 'network', ejectable: false },
  ],
  eject: vi.fn(),
}))

vi.mock('./volumes', () => ({ useVolumes: () => ({ volumes: volumeMock.volumes, loading: false, error: '', refresh: vi.fn(), eject: volumeMock.eject }) }))

beforeEach(async () => {
  cleanup()
  await i18n.changeLanguage('it')
})

const base = {
  open: true,
  home: '/home/u',
  pinned: ['/home/u/Projects', '/home/u/notes.txt'],
  remoteLocations: [],
  onToggle: vi.fn(),
  onOpenItem: vi.fn(),
  onDropToDir: vi.fn(),
  onPinPaths: vi.fn(),
  onUnpin: vi.fn(),
  onReorder: vi.fn(),
  onAdd: vi.fn(),
  canEditTags: true,
  onEditTags: vi.fn(),
  onRemoveRemote: vi.fn(),
  onRemoteError: vi.fn(),
  onRowContext: vi.fn(),
}

const dt = (types: string[], payload: unknown) => ({
  dataTransfer: { types, getData: (t: string) => (t === 'application/x-clive-paths' ? JSON.stringify(payload) : ''), setData() {}, dropEffect: '' },
})

describe('Sidebar', () => {
  beforeEach(() => {
    volumeMock.eject.mockReset().mockResolvedValue(undefined)
    vi.mocked(invoke).mockImplementation(async (command) => command === 'list_dir' ? [] as never : null as never)
  })

  it('collapsed renders a thin rail with an expand control', () => {
    render(<Sidebar {...base} open={false} />)
    const btn = screen.getByLabelText('Espandi navigatore')
    fireEvent.click(btn)
    expect(base.onToggle).toHaveBeenCalled()
  })

  it('expanded shows Places + Favourites and a pin click opens the item', () => {
    render(<Sidebar {...base} />)
    expect(screen.getByText('Preferiti')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Documenti')) // a Place
    expect(base.onOpenItem).toHaveBeenCalledWith('/home/u/Documents')
    fireEvent.click(screen.getByText('Projects')) // a pinned folder
    expect(base.onOpenItem).toHaveBeenCalledWith('/home/u/Projects')
  })

  it('always shows Tags and opens the editor from the sidebar', () => {
    render(<Sidebar {...base} />)
    expect(screen.getByText('Tag')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Modifica i tag degli elementi selezionati'))
    expect(base.onEditTags).toHaveBeenCalled()
  })

  it('prevents horizontal scrolling in the sidebar', () => {
    render(<Sidebar {...base} />)
    expect(screen.getByRole('navigation')).toHaveClass('overflow-x-hidden')
  })

  it('add button triggers the picker, unpin removes', () => {
    render(<Sidebar {...base} />)
    fireEvent.click(screen.getByLabelText('Aggiungi al navigatore'))
    expect(base.onAdd).toHaveBeenCalled()
    fireEvent.click(screen.getAllByLabelText('Rimuovi')[0])
    expect(base.onUnpin).toHaveBeenCalled()
  })

  it('dropping paths on the sidebar pins them (dedupe handled upstream)', () => {
    render(<Sidebar {...base} />)
    fireEvent.drop(screen.getByRole('navigation'), dt(['application/x-clive-paths'], ['/home/u/Downloads']))
    expect(base.onPinPaths).toHaveBeenCalledWith(['/home/u/Downloads'])
  })

  it('right-click on a Favourites row opens a context menu (path + not fixed)', () => {
    render(<Sidebar {...base} />)
    fireEvent.contextMenu(screen.getByText('Projects'))
    expect(base.onRowContext).toHaveBeenCalledWith(expect.anything(), { path: '/home/u/Projects', label: 'Projects', fixed: false })
  })

  it('right-click on a Place row reports fixed:true', () => {
    render(<Sidebar {...base} />)
    fireEvent.contextMenu(screen.getByText('Documenti'))
    expect(base.onRowContext).toHaveBeenCalledWith(expect.anything(), { path: '/home/u/Documents', label: 'Documenti', fixed: true })
  })

  it('renders a mapped remote folder and wires open/remove actions', () => {
    const onOpenItem = vi.fn()
    const onRemoveRemote = vi.fn()
    render(<Sidebar {...base} onOpenItem={onOpenItem} onRemoveRemote={onRemoveRemote} remoteLocations={[{ id: 'nas', name: 'NAS', path: '/Volumes/NAS', kind: 'local-sync' }]} />)
    fireEvent.click(screen.getByTitle('/Volumes/NAS'))
    expect(onOpenItem).toHaveBeenCalledWith('/Volumes/NAS')
    fireEvent.click(screen.getByTitle('Rimuovi cartella remota'))
    expect(onRemoveRemote).toHaveBeenCalledWith('nas')
  })

  it('filters and toggles the selected tags', () => {
    const onSelectTag = vi.fn()
    const { rerender } = render(<Sidebar {...base} tags={[{ name: 'Work', color: 4 }, { name: 'Archive', color: 1 }]} selectedTag="Work" onSelectTag={onSelectTag} />)
    expect(screen.getByRole('button', { name: 'Work' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Work' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(onSelectTag).toHaveBeenNthCalledWith(1, null)
    expect(onSelectTag).toHaveBeenNthCalledWith(2, 'Archive')

    rerender(<Sidebar {...base} tags={[{ name: 'Work', color: 4 }]} selectedTag={null} onSelectTag={onSelectTag} />)
    expect(screen.getByRole('button', { name: 'Work' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('connects an SMB folder, reports failures, and disconnects after it becomes available', async () => {
    const remoteLocations = [{ id: 'nas', name: 'NAS', path: '/Volumes/NAS', kind: 'smb' as const, endpoint: 'smb://server/share' }]
    const onOpenItem = vi.fn()
    const onRemoteError = vi.fn()
    const firstMount = render(<Sidebar {...base} remoteLocations={remoteLocations} onOpenItem={onOpenItem} onRemoteError={onRemoteError} />)
    fireEvent.click(screen.getByTitle('/Volumes/NAS'))
    await waitFor(() => expect(onOpenItem).toHaveBeenCalledWith('/Volumes/NAS'))
    expect(invoke).toHaveBeenCalledWith('connect_smb', { endpoint: 'smb://server/share' })
    expect(invoke).toHaveBeenCalledWith('list_dir', { path: '/Volumes/NAS', showHidden: undefined })

    fireEvent.click(screen.getByLabelText('Disconnetti volume'))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('disconnect_volume', { path: '/Volumes/NAS' }))

    firstMount.unmount()
    vi.mocked(invoke).mockImplementation(async (command) => command === 'connect_smb' ? Promise.reject(new Error('permission denied')) : null as never)
    render(<Sidebar {...base} remoteLocations={remoteLocations} onOpenItem={onOpenItem} onRemoteError={onRemoteError} />)
    fireEvent.click(screen.getByTitle('/Volumes/NAS'))
    await waitFor(() => expect(onRemoteError).toHaveBeenCalledWith(expect.stringContaining('permission denied')))
  })

  it('shows volume context actions and confirms eject before calling the volume service', async () => {
    const onOpenItem = vi.fn()
    render(<><Sidebar {...base} onOpenItem={onOpenItem} /><ConfirmDialog /></>)
    fireEvent.click(screen.getByText('Macintosh HD'))
    expect(onOpenItem).toHaveBeenCalledWith('/')

    fireEvent.contextMenu(screen.getByText('Backup'))
    fireEvent.click(screen.getByText('Apri'))
    expect(onOpenItem).toHaveBeenCalledWith('/Volumes/Backup')

    fireEvent.click(screen.getByLabelText('Espelli'))
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Espelli' }))
    await waitFor(() => expect(volumeMock.eject).toHaveBeenCalledWith('/Volumes/Backup'))
  })

  it('reorders pinned locations and routes file drops onto a pin to its parent folder', () => {
    const onReorder = vi.fn()
    const onDropToDir = vi.fn()
    render(<Sidebar {...base} onReorder={onReorder} onDropToDir={onDropToDir} />)
    const target = screen.getByText('notes.txt').closest('li')!
    fireEvent.drop(target, { dataTransfer: { getData: () => '/home/u/Projects' } })
    expect(onReorder).toHaveBeenCalledWith('/home/u/Projects', 1)
    fireEvent.drop(target, { ...dt(['application/x-clive-paths'], ['/tmp/incoming.txt']), altKey: true })
    expect(onDropToDir).toHaveBeenCalledWith('/home/u', ['/tmp/incoming.txt'], undefined)
  })

  it('leaves eject untouched when the confirmation is canceled and reports eject errors', async () => {
    const onRemoteError = vi.fn()
    render(<><Sidebar {...base} onRemoteError={onRemoteError} /><ConfirmDialog /></>)
    fireEvent.click(screen.getByLabelText('Espelli'))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Annulla' }))
    expect(volumeMock.eject).not.toHaveBeenCalled()

    volumeMock.eject.mockRejectedValueOnce(new Error('device busy'))
    fireEvent.click(screen.getByLabelText('Espelli'))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Espelli' }))
    await waitFor(() => expect(onRemoteError).toHaveBeenCalledWith('device busy'))
  })
})
