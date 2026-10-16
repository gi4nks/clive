// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import i18n from './i18n'
import { Sidebar } from './Sidebar'

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
  it('collapsed renders a thin rail with an expand control', () => {
    render(<Sidebar {...base} open={false} />)
    const btn = screen.getByLabelText('Espandi barra')
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
    fireEvent.click(screen.getByLabelText('Aggiungi alla barra'))
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
    fireEvent.click(screen.getByText('NAS'))
    expect(onOpenItem).toHaveBeenCalledWith('/Volumes/NAS')
    fireEvent.click(screen.getByTitle('Rimuovi cartella remota'))
    expect(onRemoveRemote).toHaveBeenCalledWith('nas')
  })
})
