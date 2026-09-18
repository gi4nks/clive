// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import i18n from './i18n'

const mocks = vi.hoisted(() => ({
  trashRestore: vi.fn(async () => '/orig/x.txt'),
  trashEmpty: vi.fn(async () => undefined),
  trashDeleteForever: vi.fn(async () => undefined),
  trashEmpty: vi.fn(async () => undefined),
  openPath: vi.fn(async () => undefined),
  revealInFinder: vi.fn(async () => undefined),
}))

vi.mock('./api', async (io) => {
  const actual = await io<typeof import('./api')>()
  return {
    ...actual,
    trashList: async () => (mocks.trashEmpty.mock.calls.length ? [] : [
      { id: 'aaa', originalPath: '/orig/x.txt', deletedAt: 10, isDir: false, size: 5, modified: 1 },
    ]),
    trashEmpty: mocks.trashEmpty,
    emptyTrash: () => { throw new Error('Finder empty must not be called') },
    ...mocks,
  }
})

import { TrashWidget } from './widgets'
import type { WidgetCtx } from './widgetTypes'

const ctx = { home: '/home/u', setStatus: vi.fn(), refresh: vi.fn() } as unknown as WidgetCtx

beforeEach(async () => {
  cleanup()
  mocks.trashRestore.mockClear(); mocks.trashDeleteForever.mockClear()
  await i18n.changeLanguage('en')
})
afterEach(() => cleanup())

describe('TrashWidget', () => {
  it('lists a trashed item by original basename', async () => {
    render(<TrashWidget ctx={ctx} />)
    fireEvent.click(screen.getByTitle('Trash'))
    expect(await screen.findByText('x.txt')).toBeInTheDocument()
  })
  it('opens the context menu on right-click with Restore + Delete', async () => {
    render(<TrashWidget ctx={ctx} />)
    fireEvent.click(screen.getByTitle('Trash'))
    const row = await screen.findByText('x.txt')
    fireEvent.contextMenu(row)
    expect(screen.getByText('Restore')).toBeInTheDocument()
    expect(screen.getByText('Delete immediately')).toBeInTheDocument()
  })
  it('Restore calls trashRestore(id)', async () => {
    render(<TrashWidget ctx={ctx} />)
    fireEvent.click(screen.getByTitle('Trash'))
    const row = await screen.findByText('x.txt')
    fireEvent.contextMenu(row)
    fireEvent.click(screen.getByText('Restore'))
    expect(mocks.trashRestore).toHaveBeenCalledWith('aaa')
  })
})

describe('TrashWidget empty', () => {
  it('empties only Clive trash (no Finder call) and refreshes the list', async () => {
    render(<TrashWidget ctx={ctx} />)
    fireEvent.click(screen.getByTitle('Trash'))
    await screen.findByText('x.txt') // wait for the async list (button disabled until loaded)
    fireEvent.click(screen.getByText('Empty Trash'))
    // the confirm sheet must portal out of the popover onto the window body
    const sheet = await waitFor(() => {
      const el = document.querySelector('[data-trash-confirm]')
      if (!el) throw new Error('no sheet')
      expect(el.parentElement).toBe(document.body)
      return el
    })
    expect(sheet.classList.contains('fixed')).toBe(false)
    fireEvent.click(within(sheet as HTMLElement).getByText('Empty'))
    await waitFor(() => expect(mocks.trashEmpty).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByTitle('Trash')).not.toBeNull())
  })
})
