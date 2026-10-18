// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import App from './App'
import { getClipboard, listDir } from './api'
import { DEFAULT_CONFIG, setAppConfig } from './settings/appConfig'

const { files } = vi.hoisted(() => ({
  files: [
    { name: 'Documents', path: '/Users/test/Documents', isDir: true, size: 0, modified: 1, extension: null, tags: [] },
    { name: 'notes.txt', path: '/Users/test/notes.txt', isDir: false, size: 12, modified: 2, extension: 'txt', tags: [] },
    { name: 'photo.jpg', path: '/Users/test/photo.jpg', isDir: false, size: 1024, modified: 3, extension: 'jpg', tags: [] },
  ],
}))

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return {
    ...actual,
    homeDir: vi.fn().mockResolvedValue('/Users/test'),
    listDir: vi.fn().mockResolvedValue(files),
    listVolumes: vi.fn().mockResolvedValue([]),
    getClipboard: vi.fn().mockResolvedValue({ paths: [], operation: null }),
  }
})

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ startDragging: vi.fn().mockResolvedValue(undefined) }),
}))

describe('App shell', () => {
  beforeEach(() => {
    setAppConfig({ ...DEFAULT_CONFIG })
    vi.mocked(invoke).mockImplementation(async () => null as never)
    vi.mocked(getClipboard).mockResolvedValue({ paths: [], operation: null })
    Element.prototype.scrollIntoView = vi.fn()
    class MockResizeObserver {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.mocked(invoke).mockReset()
  })

  it('initializes both panes and displays the primary file manager controls', async () => {
    render(<App />)

    await waitFor(() => expect(screen.getAllByText('notes.txt')).toHaveLength(2))
    expect(screen.getAllByText('Documents')).toHaveLength(3)
    expect(screen.getByTitle(/View as list|List view/i)).toBeInTheDocument()
    expect(screen.getByTitle(/View as cards|Grid view/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /refresh/i }).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByTitle(/View as cards|Grid view/i))
    expect(screen.getAllByRole('img', { name: 'image' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('img', { name: 'image' })[0]).toHaveClass('h-[76px]', 'w-[76px]')
    fireEvent.click(screen.getByTitle(/View as list|List view/i))

    fireEvent.click(screen.getAllByTitle(/New folder/i)[0])
    fireEvent.click(screen.getByRole('button', { name: /create/i }))
    await waitFor(() => expect(document.querySelector('.modal.modal-open')).toBeNull())
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('creates a named folder and refreshes the active directory', async () => {
    render(<App />)
    await screen.findAllByText('notes.txt')

    fireEvent.click(screen.getAllByTitle(/New folder/)[0])
    fireEvent.change(screen.getByPlaceholderText('Folder name'), { target: { value: 'Archive 2026' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('create_folder', {
      parent: '/Users/test', name: 'Archive 2026', allowSystem: false,
    }))
    await waitFor(() => expect(document.querySelector('.modal.modal-open')).toBeNull())
  })

  it('selects files from the keyboard and completes the confirmed trash workflow', async () => {
    render(<App />)
    await screen.findAllByText('notes.txt')
    fireEvent.click(screen.getAllByText('notes.txt')[0])
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true })
    expect(document.querySelectorAll('[aria-selected="true"]')).toHaveLength(3)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelectorAll('[aria-selected="true"]')).toHaveLength(0)
    fireEvent.click(screen.getAllByText('notes.txt')[0])
    fireEvent.click(screen.getByTitle('Trash (⌫)'))
    expect(screen.getByText('Move to Trash?')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' }).at(-1)!)
    expect(screen.queryByText('Move to Trash?')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Trash (⌫)'))
    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }))

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('delete_to_trash', {
      path: '/Users/test/notes.txt', allowSystem: false,
    }))
  })

  it('pins a file from its context menu and opens the path editor with keyboard navigation', async () => {
    render(<App />)
    await screen.findAllByText('notes.txt')
    fireEvent.contextMenu(screen.getAllByText('notes.txt')[0], { clientX: 40, clientY: 50 })
    fireEvent.click(screen.getByRole('button', { name: 'Pin to Navigator' }))
    expect(await screen.findByTitle('/Users/test/notes.txt')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'l', metaKey: true })
    const pathInput = screen.getByDisplayValue('/Users/test')
    fireEvent.change(pathInput, { target: { value: '/Users/test/Projects' } })
    fireEvent.keyDown(pathInput, { key: 'Enter' })
    await waitFor(() => expect(listDir).toHaveBeenCalledWith('/Users/test/Projects', false))
  })

  it('opens settings, shortcuts and preview, and collapses the navigator', async () => {
    render(<App />)
    await screen.findAllByText('notes.txt')
    fireEvent.click(screen.getByTitle('Settings'))
    expect(await screen.findByText('General')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0])

    fireEvent.keyDown(window, { key: '/', metaKey: true })
    expect(await screen.findByText('Keyboard shortcuts')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })

    fireEvent.click(screen.getByTitle('Toggle preview panel'))
    expect(await screen.findByText('Select a file to preview it')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Collapse navigator'))
    expect(screen.getAllByTitle('Expand navigator')).toHaveLength(2)
  })

  it('opens the transfer destination picker and copies the selected file there', async () => {
    render(<App />)
    await screen.findAllByText('notes.txt')
    fireEvent.contextMenu(screen.getAllByText('notes.txt')[0], { clientX: 40, clientY: 50 })
    fireEvent.click(screen.getByRole('button', { name: 'Copy to…' }))
    expect(await screen.findByText('Other pane')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('/Users'))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('transfer_items', expect.objectContaining({
      paths: ['/Users/test/notes.txt'], dstDir: '/Users', mode: 'copy', allowSystem: false,
    })))
  })

  it('navigates home and to the parent, and lets Escape leave path editing', async () => {
    render(<App />)
    await screen.findAllByText('notes.txt')
    fireEvent.click(screen.getByTitle('Up (⌘↑)'))
    await waitFor(() => expect(listDir).toHaveBeenCalledWith('/Users', false))
    fireEvent.click(screen.getByTitle('Home'))
    await waitFor(() => expect(listDir).toHaveBeenCalledWith('/Users/test', false))
    fireEvent.click(screen.getByTitle('Click or ⌘L to edit the path'))
    const pathInput = screen.getByDisplayValue('/Users/test')
    fireEvent.change(pathInput, { target: { value: '/tmp' } })
    fireEvent.keyDown(pathInput, { key: 'Escape' })
    expect(screen.queryByDisplayValue('/tmp')).not.toBeInTheDocument()
  })

  it('supports keyboard range selection, pane switching, and preview shortcut', async () => {
    render(<App />)
    await screen.findAllByText('notes.txt')
    fireEvent.click(screen.getAllByText('notes.txt')[0])
    fireEvent.keyDown(window, { key: 'ArrowDown', shiftKey: true })
    expect(document.querySelectorAll('[aria-selected="true"]')).toHaveLength(2)
    fireEvent.keyDown(window, { key: 'Tab' })
    fireEvent.keyDown(window, { key: '2', metaKey: true })
    fireEvent.keyDown(window, { key: 'p', metaKey: true, shiftKey: true })
    expect(await screen.findByText('Select a file to preview it')).toBeInTheDocument()
  })

  it('adds a trimmed path to the navigator and cancels the add dialog with Escape', async () => {
    render(<App />)
    await screen.findAllByText('notes.txt')
    fireEvent.click(screen.getByTitle('Add to Navigator'))
    const input = screen.getByPlaceholderText('Path to pin…')
    fireEvent.change(input, { target: { value: '  /tmp/work  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByTitle('/tmp/work')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Add to Navigator'))
    fireEvent.keyDown(screen.getByPlaceholderText('Path to pin…'), { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Path to pin…')).not.toBeInTheDocument()
  })

  it('reports blank folder names and cancels the create-folder dialog with Escape', async () => {
    render(<App />)
    await screen.findAllByText('notes.txt')
    fireEvent.click(screen.getAllByTitle(/New folder/)[0])
    fireEvent.change(screen.getByPlaceholderText('Folder name'), { target: { value: '  ' } })
    fireEvent.keyDown(screen.getByPlaceholderText('Folder name'), { key: 'Enter' })
    expect(await screen.findByRole('status')).toBeInTheDocument()
    fireEvent.click(screen.getAllByTitle(/New folder/)[0])
    fireEvent.keyDown(screen.getByPlaceholderText('Folder name'), { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Folder name')).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByTitle(/New folder/)[0])
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByPlaceholderText('Folder name')).not.toBeInTheDocument()
  })

  it('pastes and clears an existing clipboard operation', async () => {
    vi.mocked(getClipboard).mockResolvedValue({ paths: ['/tmp/source.txt'], operation: 'copy' })
    render(<App />)
    await screen.findAllByText('notes.txt')
    await waitFor(() => expect(screen.getByTitle(/Paste/)).toBeEnabled())
    fireEvent.click(screen.getAllByTitle(/Paste/)[0])
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('paste_paths', expect.objectContaining({ targetDir: '/Users/test' })))
    fireEvent.click(document.querySelector('button[title="Click to clear clipboard"]')!)
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('clear_clipboard', {}))
  })

  it('opens file details from the context menu and closes them with Escape', async () => {
    render(<App />)
    await screen.findAllByText('notes.txt')
    fireEvent.contextMenu(screen.getAllByText('notes.txt')[0], { clientX: 35, clientY: 45 })
    fireEvent.click(screen.getAllByRole('button', { name: 'Get Info' }).at(-1)!)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('surfaces filesystem failures from folder creation, rename, and trash', async () => {
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (['create_folder', 'rename', 'delete_to_trash'].includes(String(command))) throw new Error('permission denied')
      return null as never
    })
    const { unmount } = render(<App />)
    await screen.findAllByText('notes.txt')
    fireEvent.click(screen.getAllByTitle(/New folder/)[0])
    fireEvent.change(screen.getByPlaceholderText('Folder name'), { target: { value: 'Archive' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(await screen.findByRole('status')).toHaveTextContent('permission denied')

    unmount()
    render(<App />)
    await screen.findAllByText('notes.txt')
    fireEvent.click(screen.getAllByText('notes.txt')[0])
    fireEvent.click(screen.getAllByTitle(/Rename/)[0])
    const renameInput = screen.getByDisplayValue('notes')
    fireEvent.change(renameInput, { target: { value: 'renamed' } })
    fireEvent.keyDown(renameInput, { key: 'Enter' })
    expect(await screen.findByRole('status')).toHaveTextContent('permission denied')

    cleanup()
    render(<App />)
    await screen.findAllByText('notes.txt')
    fireEvent.click(screen.getAllByText('notes.txt')[0])
    fireEvent.click(screen.getAllByTitle(/Trash/)[0])
    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }))
    expect(await screen.findByRole('status')).toHaveTextContent('permission denied')
  })

  it('opens a folder context action and navigates into that folder before creating inside it', async () => {
    render(<App />)
    await screen.findAllByText('Documents')
    fireEvent.contextMenu(screen.getAllByText('Documents').at(-1)!, { clientX: 22, clientY: 33 })
    fireEvent.click(screen.getByRole('button', { name: 'New folder here' }))
    await waitFor(() => expect(listDir).toHaveBeenCalledWith('/Users/test/Documents', false))
    fireEvent.change(screen.getByPlaceholderText('Folder name'), { target: { value: 'Invoices' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('create_folder', expect.objectContaining({
      parent: '/Users/test/Documents', name: 'Invoices', allowSystem: false,
    })))
  })

  it('opens shortcut-driven new folder and toggles the navigator', async () => {
    render(<App />)
    await screen.findAllByText('notes.txt')
    fireEvent.keyDown(window, { key: 'n', metaKey: true })
    expect(screen.getByPlaceholderText('Folder name')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'b', metaKey: true })
    expect(screen.getAllByTitle('Expand navigator')).toHaveLength(2)
    fireEvent.keyDown(window, { key: 'b', metaKey: true })
    expect(screen.getByTitle('Collapse navigator')).toBeInTheDocument()
  })

  it('reports a failed directory refresh and removes stale entries from the pane', async () => {
    render(<App />)
    await screen.findAllByText('notes.txt')
    expect(screen.getAllByText('notes.txt')).toHaveLength(2)

    vi.mocked(listDir).mockRejectedValueOnce(new Error('permission denied'))
    fireEvent.click(screen.getByTitle('Up (⌘↑)'))

    expect(await screen.findByRole('status')).toHaveTextContent('permission denied')
    // The other pane still has its listing; the failed pane must not present
    // the old directory's entries under its newly navigated path.
    await waitFor(() => expect(screen.getAllByText('notes.txt')).toHaveLength(1))
  })

  it('ignores an older directory response that arrives after a newer navigation', async () => {
    type Entries = Awaited<ReturnType<typeof listDir>>
    let resolveDocuments!: (entries: Entries) => void
    let resolveParent!: (entries: Entries) => void
    vi.mocked(listDir).mockImplementation((path) => {
      if (path === '/Users/test/Documents') return new Promise((resolve) => { resolveDocuments = resolve })
      if (path === '/Users') return new Promise((resolve) => { resolveParent = resolve })
      return Promise.resolve(files)
    })

    render(<App />)
    await screen.findAllByText('notes.txt')
    const documents = document.querySelectorAll('[data-file-path="/Users/test/Documents"]')[0]
    fireEvent.doubleClick(documents)
    await waitFor(() => expect(listDir).toHaveBeenCalledWith('/Users/test/Documents', false))

    fireEvent.click(screen.getByTitle('Up (⌘↑)'))
    await waitFor(() => expect(listDir).toHaveBeenCalledWith('/Users', false))

    const freshEntry = { ...files[1], name: 'fresh.txt', path: '/Users/fresh.txt' }
    const staleEntry = { ...files[1], name: 'stale.txt', path: '/Users/test/Documents/stale.txt' }
    await act(async () => resolveParent([freshEntry]))
    expect(await screen.findByText('fresh.txt')).toBeInTheDocument()
    await act(async () => resolveDocuments([staleEntry]))

    expect(screen.queryByText('stale.txt')).not.toBeInTheDocument()
    expect(screen.getByText('fresh.txt')).toBeInTheDocument()
  })

  it('opens a selected file with Enter, invokes Quick Look with Space, and renames it inline', async () => {
    render(<App />)
    await screen.findAllByText('notes.txt')
    fireEvent.click(screen.getAllByText('notes.txt')[0])
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('reveal_in_finder', { path: '/Users/test/notes.txt' }))
    fireEvent.keyDown(window, { key: ' ' })
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('quick_look', { path: '/Users/test/notes.txt' }))

    fireEvent.click(screen.getAllByTitle(/Rename/)[0])
    const input = screen.getByDisplayValue('notes')
    fireEvent.change(input, { target: { value: 'meeting-notes' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('rename', expect.objectContaining({
      path: '/Users/test/notes.txt', newName: 'meeting-notes', allowSystem: false,
    })))
  })

  it('opens the archive extraction destination picker and extracts to the chosen folder', async () => {
    const count = files.length
    files.push({ name: 'bundle.zip', path: '/Users/test/bundle.zip', isDir: false, size: 24, modified: 4, extension: 'zip', tags: [] })
    vi.mocked(invoke).mockImplementation(async (command) => command === 'zip_extract'
      ? { extracted: 2, skipped: [] } as never
      : null as never)
    try {
      render(<App />)
      await screen.findAllByText('bundle.zip')
      fireEvent.contextMenu(screen.getAllByText('bundle.zip')[0], { clientX: 42, clientY: 54 })
      fireEvent.click(screen.getByRole('button', { name: 'Extract to…' }))
      const dialog = await screen.findByRole('dialog', { name: 'Extract to…' })
      fireEvent.change(dialog.querySelector('input')!, { target: { value: '/tmp/unpacked' } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Extract' }))
      await waitFor(() => expect(invoke).toHaveBeenCalledWith('zip_extract', {
        path: '/Users/test/bundle.zip', dest: '/tmp/unpacked', entries: null,
      }))
    } finally {
      files.splice(count)
    }
  })
})
