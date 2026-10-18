// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }))
const serviceMocks = vi.hoisted(() => ({
  diskSpace: vi.fn(async () => ({ totalBytes: 1000, usedBytes: 400, freeBytes: 600, volumeName: 'Home volume' })),
  trashList: vi.fn(async () => [{ id: 'trash-1', originalPath: '/home/u/old.txt', deletedAt: 1, isDir: false, size: 8, modified: 0 }]),
  trashRestore: vi.fn(async () => undefined), trashDeleteForever: vi.fn(async () => undefined), trashEmpty: vi.fn(async () => undefined),
  openPath: vi.fn(async () => undefined), revealInFinder: vi.fn(async () => undefined),
}))
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), ...serviceMocks }))
vi.mock('./volumes', () => ({ useVolumes: () => ({ volumes: [], loading: false, error: '', refresh: vi.fn(), eject: vi.fn() }) }))
import { CalendarWidget, ClipboardChipWidget, ClockWidget, ContextActionsWidget, CountWidget, DiskWidget, LauncherWidget, SearchWidget, TrashWidget } from './widgets'
import type { WidgetCtx } from './widgetTypes'

const makeCtx = (over: Partial<WidgetCtx> = {}): WidgetCtx => ({
  currentPath: '/home/u/Projects', home: '/home/u', entries: [], selectedEntries: [],
  clip: { paths: [], operation: null }, pasteInFlight: false, hiddenVisible: false, searchQuery: '',
  navigate: vi.fn(), refresh: vi.fn(), setHiddenVisible: vi.fn(), setSearchQuery: vi.fn(),
  copyCut: vi.fn(), paste: vi.fn(), clearClipboard: vi.fn(), openTerminalHere: vi.fn(),
  setStatus: vi.fn(), actionsFor: vi.fn(() => []), ai: {} as never, aiEnabled: true, ...over,
})

beforeEach(() => {
  serviceMocks.diskSpace.mockClear()
  serviceMocks.trashList.mockClear()
  serviceMocks.trashRestore.mockClear()
  serviceMocks.trashDeleteForever.mockClear()
  serviceMocks.trashEmpty.mockClear()
  serviceMocks.openPath.mockClear()
})
afterEach(cleanup)

describe('status bar widgets', () => {
  it('shows selected counts and drives search changes, clear, and Escape', () => {
    const ctx = makeCtx({
      entries: [{ name: 'a', path: '/a', isDir: false, size: 1, modified: 0, extension: 'txt' }],
      selectedEntries: [{ name: 'a', path: '/a', isDir: false, size: 1, modified: 0, extension: 'txt' }],
      searchQuery: 'notes',
    })
    const { rerender } = render(<><CountWidget ctx={ctx} /><SearchWidget ctx={ctx} /></>)
    expect(screen.getByText(/count.elements/)).toBeInTheDocument()
    expect(screen.getByText(/count.selected/)).toBeInTheDocument()
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'report' } })
    expect(ctx.setSearchQuery).toHaveBeenCalledWith('report')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(ctx.setSearchQuery).toHaveBeenCalledWith('')
    rerender(<SearchWidget ctx={makeCtx()} />)
    expect(screen.queryByTitle('search.clear')).not.toBeInTheDocument()
  })

  it('clears a clipboard chip and shows its paste-in-flight indicator', () => {
    const ctx = makeCtx({ clip: { paths: ['/a', '/b'], operation: 'move' }, pasteInFlight: true })
    render(<ClipboardChipWidget ctx={ctx} />)
    expect(screen.getByText(/2 · chip.move/)).toBeInTheDocument()
    expect(document.querySelector('.loading-spinner')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    expect(ctx.clearClipboard).toHaveBeenCalledOnce()
  })

  it('shows up to three actions inline and dispatches overflow actions', () => {
    const fired = vi.fn()
    const actions = Array.from({ length: 4 }, (_, i) => ({ key: `${i}`, label: `Action ${i}`, onSelect: fired }))
    const ctx = makeCtx({ actionsFor: vi.fn(() => actions) })
    render(<ContextActionsWidget ctx={ctx} />)
    expect(screen.getAllByTitle(/Action/)).toHaveLength(3)
    fireEvent.click(screen.getByTitle('overflow.title'))
    fireEvent.click(screen.getByRole('button', { name: 'Action 3' }))
    expect(fired).toHaveBeenCalledOnce()
  })

  it('opens the launcher and closes it after running an action', () => {
    const ctx = makeCtx()
    render(<LauncherWidget ctx={ctx} />)
    fireEvent.click(screen.getByTitle('launcher.title'))
    fireEvent.click(screen.getByRole('button', { name: 'launcher.openTerminal' }))
    expect(ctx.openTerminalHere).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'launcher.openTerminal' })).not.toBeInTheDocument()
  })

  it('opens clock and calendar popovers with their date details', () => {
    render(<><ClockWidget /><CalendarWidget /></>)
    fireEvent.click(screen.getByTitle('clock.title'))
    expect(document.querySelector('.text-3xl')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('calendar.title'))
    expect(document.querySelector('.grid-cols-7')).toBeInTheDocument()
  })

  it('loads disk usage and refreshes it from the popover', async () => {
    const ctx = makeCtx()
    render(<DiskWidget ctx={ctx} />)
    fireEvent.click(screen.getByTitle('disk.title'))
    expect(await screen.findByText('Home volume')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(serviceMocks.diskSpace).toHaveBeenCalled()
  })

  it('restores an item and confirms emptying the trash', async () => {
    const ctx = makeCtx()
    render(<TrashWidget ctx={ctx} />)
    fireEvent.click(screen.getByTitle('trash.widget'))
    fireEvent.click(await screen.findByTitle('/home/u/old.txt'))
    fireEvent.click(screen.getByRole('button', { name: 'trash.restore' }))
    await waitFor(() => expect(ctx.setStatus).toHaveBeenCalledWith('trash.restored', 'success'))
    expect(serviceMocks.trashRestore).toHaveBeenCalledWith('trash-1')
    expect(ctx.refresh).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'trash.emptyAction' }))
    expect(await screen.findByText('trash.confirmTitle')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'trash.confirm' }))
    expect(serviceMocks.trashEmpty).toHaveBeenCalledOnce()
  })

  it('opens and permanently deletes an individual trash item', async () => {
    const ctx = makeCtx()
    render(<TrashWidget ctx={ctx} />)
    fireEvent.click(screen.getByTitle('trash.widget'))
    const item = await screen.findByTitle('/home/u/old.txt')
    fireEvent.click(item)
    fireEvent.click(screen.getByRole('button', { name: 'trash.openItem' }))
    await waitFor(() => expect(serviceMocks.openPath).toHaveBeenCalledWith('/home/u/.Trash/trash-1'))
    fireEvent.click(item)
    fireEvent.click(screen.getByRole('button', { name: 'trash.deleteForever' }))
    await waitFor(() => expect(serviceMocks.trashDeleteForever).toHaveBeenCalledWith('trash-1'))
    expect(ctx.setStatus).toHaveBeenCalledWith('trash.deletedForever', 'success')
  })
})
