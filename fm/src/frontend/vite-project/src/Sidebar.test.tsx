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
  onToggle: vi.fn(),
  onOpenItem: vi.fn(),
  onDropToDir: vi.fn(),
  onPinPaths: vi.fn(),
  onUnpin: vi.fn(),
  onReorder: vi.fn(),
  onAdd: vi.fn(),
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
})
