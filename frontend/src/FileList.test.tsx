// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup, screen } from '@testing-library/react'
import { filterFolderDrop, FileList } from './FileList.js'
import type { FileEntry } from './api.js'

vi.mock('./ChildCountBadge', () => ({ ChildCountBadge: () => <span data-testid="cc" /> }))

const entry = (name: string, isDir = false): FileEntry => ({
  name,
  path: `/root/${name}`,
  isDir,
  size: isDir ? 0 : 3,
  modified: 0,
  extension: null,
})

describe('filterFolderDrop', () => {
  it('keeps only sources that can move into the dir', () => {
    const paths = ['/root/a.txt', '/root/docs', '/root/docs/x', '/root/other', '/root']
    expect(filterFolderDrop('/root/docs', paths)).toEqual(['/root/a.txt', '/root/other'])
  })
  it('rejects moving a dir into its own descendant', () => {
    expect(filterFolderDrop('/root/docs/sub', ['/root/docs', '/root/docs/sub', '/root/z'])).toEqual(['/root/z'])
  })
  it('is a no-op when every source is already inside or invalid', () => {
    expect(filterFolderDrop('/root/docs', ['/root/docs/a', '/root/docs/b'])).toEqual([])
  })
})

describe('FileList folder drop', () => {
  afterEach(cleanup)

  const renderList = (onDropToFolder: any) =>
    render(
      <FileList
        paneId="left"
        files={[entry('docs', true), entry('a.txt')]}
        selected={new Set(['/root/a.txt'])}
        renamingPath={null}
        view="list"
        sort={{ key: 'name', dir: 1 }}
        onSortChange={vi.fn()}
        onItemClick={vi.fn()}
        onItemDoubleClick={vi.fn()}
        onRenameConfirm={vi.fn()}
        onRenameCancel={vi.fn()}
        onItemContextMenu={vi.fn()}
        onDropToFolder={onDropToFolder}
      />,
    )

  const dt = (paths: string[], altKey = false) => ({
    altKey,
    dataTransfer: {
      types: ['application/x-clive-paths'],
      getData: (k: string) => (k === 'application/x-clive-paths' ? JSON.stringify(paths) : ''),
      setData() {},
      dropEffect: '',
    },
  })

  it('moving a selected file onto a folder row calls onDropToFolder', () => {
    const onDrop = vi.fn()
    renderList(onDrop)
    const folder = document.querySelector('[data-file-path="/root/docs"]')!
    fireEvent.drop(folder, dt(['/root/a.txt']))
    expect(onDrop).toHaveBeenCalledWith('/root/docs', ['/root/a.txt'], false)
  })

  it('ignores a drop whose only source is already inside the target', () => {
    const onDrop = vi.fn()
    renderList(onDrop)
    const folder = document.querySelector('[data-file-path="/root/docs"]')!
    fireEvent.drop(folder, dt(['/root/docs/inner']))
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('keeps rows single-line: name/size/date cells truncate instead of wrapping', () => {
    renderList(vi.fn())
    const row = document.querySelector('[data-file-path="/root/a.txt"]')!
    const spans = [...row.querySelectorAll('span')].filter((x) => !x.classList.contains('sr-only'))
    expect(spans.some((x) => /long-name/.test(x.textContent || ''))).toBe(false)
    const date = spans[spans.length - 1]
    expect(date.className).toContain('truncate')
    const size = spans.find((x) => x.className.includes('tabular-nums'))!
    expect(size.className).toContain('truncate')
  })

  it('does not turn a file row into a folder drop target', () => {
    const onDrop = vi.fn()
    renderList(onDrop)
    const fileRow = document.querySelector('[data-file-path="/root/a.txt"]')!
    // no onDragOver handler on non-dir rows -> no preventDefault / no call
    fireEvent.drop(fileRow, dt(['/root/a.txt']))
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('renders large Clive artwork in card mode', () => {
    const { getByRole } = render(
      <FileList
        paneId="left"
        files={[{ ...entry('photo.jpg'), extension: 'jpg' }]}
        selected={new Set()}
        renamingPath={null}
        view="grid"
        sort={{ key: 'name', dir: 1 }}
        onSortChange={vi.fn()}
        onItemClick={vi.fn()}
        onItemDoubleClick={vi.fn()}
        onRenameConfirm={vi.fn()}
        onRenameCancel={vi.fn()}
        onItemContextMenu={vi.fn()}
      />,
    )
    expect(getByRole('img', { name: 'image' })).toHaveClass('h-[76px]', 'w-[76px]')
  })

  it('shows file tags and writes the drag payload in list mode', () => {
    const file = { ...entry('a.txt'), tags: [{ name: 'important', color: 4 }] }
    const setData = vi.fn()
    const { container } = render(<FileList paneId="left" files={[file]} selected={new Set()} renamingPath={null} view="list"
      sort={{ key: 'name', dir: 1 }} onSortChange={vi.fn()} onItemClick={vi.fn()} onItemDoubleClick={vi.fn()}
      onRenameConfirm={vi.fn()} onRenameCancel={vi.fn()} onItemContextMenu={vi.fn()} dragPayload={(f) => JSON.stringify([f.path])} />)
    const row = container.querySelector('[data-file-path="/root/a.txt"]')!
    expect(row.querySelector('[title="important"]')).toBeInTheDocument()
    fireEvent.dragStart(row, { dataTransfer: { setData, effectAllowed: 'none' } })
    expect(setData).toHaveBeenCalledWith('application/x-clive-paths', '["/root/a.txt"]')
  })

  it('forwards click, double-click, context-menu, sort, and rename events from rows', () => {
    const onItemClick = vi.fn()
    const onItemDoubleClick = vi.fn()
    const onItemContextMenu = vi.fn()
    const onSortChange = vi.fn()
    const onRenameConfirm = vi.fn()
    const { rerender, container } = render(
      <FileList paneId="left" files={[entry('a.txt')]} selected={new Set()} renamingPath={null} view="list"
        sort={{ key: 'name', dir: 1 }} onSortChange={onSortChange} onItemClick={onItemClick} onItemDoubleClick={onItemDoubleClick}
        onRenameConfirm={onRenameConfirm} onRenameCancel={vi.fn()} onItemContextMenu={onItemContextMenu} />,
    )
    const row = container.querySelector('[data-file-path="/root/a.txt"]')!
    fireEvent.click(row, { ctrlKey: true })
    expect(onItemClick).toHaveBeenCalledWith(expect.objectContaining({ name: 'a.txt' }), expect.objectContaining({ ctrlKey: true }))
    fireEvent.doubleClick(row)
    expect(onItemDoubleClick).toHaveBeenCalledWith(expect.objectContaining({ path: '/root/a.txt' }))
    fireEvent.contextMenu(row, { clientX: 12, clientY: 18 })
    expect(onItemContextMenu).toHaveBeenCalledWith(expect.objectContaining({ name: 'a.txt' }), 12, 18, expect.anything())
    fireEvent.click(screen.getByRole('button', { name: /size/i }))
    expect(onSortChange).toHaveBeenCalledWith('size')

    rerender(<FileList paneId="left" files={[entry('a.txt')]} selected={new Set()} renamingPath="/root/a.txt" view="list"
      sort={{ key: 'name', dir: 1 }} onSortChange={onSortChange} onItemClick={onItemClick} onItemDoubleClick={onItemDoubleClick}
      onRenameConfirm={onRenameConfirm} onRenameCancel={vi.fn()} onItemContextMenu={onItemContextMenu} />)
    const input = screen.getByDisplayValue('a')
    fireEvent.change(input, { target: { value: 'renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRenameConfirm).toHaveBeenCalledWith(expect.objectContaining({ path: '/root/a.txt' }), 'renamed')
  })

  it('cancels invalid or unchanged rename input and cancels a rename on Escape', () => {
    const onRenameCancel = vi.fn()
    const { rerender } = render(<FileList paneId="left" files={[entry('a.txt')]} selected={new Set()} renamingPath="/root/a.txt" view="list"
      sort={{ key: 'name', dir: 1 }} onSortChange={vi.fn()} onItemClick={vi.fn()} onItemDoubleClick={vi.fn()}
      onRenameConfirm={vi.fn()} onRenameCancel={onRenameCancel} onItemContextMenu={vi.fn()} />)
    fireEvent.keyDown(screen.getByDisplayValue('a'), { key: 'Escape' })
    expect(onRenameCancel).toHaveBeenCalledOnce()

    rerender(<FileList paneId="left" files={[entry('a.txt')]} selected={new Set()} renamingPath="/root/a.txt" view="list"
      sort={{ key: 'name', dir: 1 }} onSortChange={vi.fn()} onItemClick={vi.fn()} onItemDoubleClick={vi.fn()}
      onRenameConfirm={vi.fn()} onRenameCancel={onRenameCancel} onItemContextMenu={vi.fn()} />)
    const input = screen.getByDisplayValue('a')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRenameCancel).toHaveBeenCalledTimes(2)
  })

  it('starts and ends a marquee selection on blank space but ignores a right-click', () => {
    const onMarqueeSelect = vi.fn()
    const { container } = render(<FileList paneId="left" files={[entry('a.txt')]} selected={new Set()} renamingPath={null} view="list"
      sort={{ key: 'name', dir: 1 }} onSortChange={vi.fn()} onItemClick={vi.fn()} onItemDoubleClick={vi.fn()}
      onRenameConfirm={vi.fn()} onRenameCancel={vi.fn()} onItemContextMenu={vi.fn()} onMarqueeSelect={onMarqueeSelect} />)
    const scroll = container.querySelector('.scroll-area')!
    fireEvent.pointerDown(scroll, { button: 2, clientX: 0, clientY: 0 })
    expect(onMarqueeSelect).not.toHaveBeenCalled()
    fireEvent.pointerDown(scroll, { button: 0, clientX: 0, clientY: 0, pointerId: 1 })
    fireEvent.pointerUp(scroll, { clientX: 0, clientY: 0, pointerId: 1, ctrlKey: true })
    expect(onMarqueeSelect).toHaveBeenCalledWith([], undefined)
  })

  it('supports card interactions, tag dots, drag payloads, and folder copy drops', () => {
    const onItemClick = vi.fn()
    const onItemDoubleClick = vi.fn()
    const onItemContextMenu = vi.fn()
    const onDropToFolder = vi.fn()
    const file = { ...entry('photo.jpg'), extension: 'jpg', tags: [{ name: 'favorite', color: 3 }] }
    const folder = entry('Pictures', true)
    const { container } = render(<FileList paneId="left" files={[folder, file]} selected={new Set(['/root/photo.jpg'])}
      renamingPath={null} view="grid" sort={{ key: 'name', dir: -1 }} onSortChange={vi.fn()}
      onItemClick={onItemClick} onItemDoubleClick={onItemDoubleClick} onRenameConfirm={vi.fn()} onRenameCancel={vi.fn()}
      onItemContextMenu={onItemContextMenu} dragPayload={(f) => JSON.stringify([f.path])} onDropToFolder={onDropToFolder} />)
    const card = container.querySelector('[data-file-path="/root/photo.jpg"]')!
    fireEvent.click(card)
    fireEvent.doubleClick(card)
    fireEvent.contextMenu(card, { clientX: 7, clientY: 9 })
    fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), effectAllowed: 'none' } })
    expect(onItemClick).toHaveBeenCalledOnce()
    expect(onItemDoubleClick).toHaveBeenCalledOnce()
    expect(onItemContextMenu).toHaveBeenCalledOnce()
    expect(card.querySelector('[title="favorite"]')).toBeInTheDocument()

    const folderCard = container.querySelector('[data-file-path="/root/Pictures"]')!
    const payload = { types: ['application/x-clive-paths'], getData: () => JSON.stringify(['/root/photo.jpg']), dropEffect: 'none' }
    fireEvent.dragOver(folderCard, { dataTransfer: payload, altKey: true })
    expect(folderCard.className).toContain('ring-primary')
    fireEvent.dragLeave(folderCard)
    fireEvent.drop(folderCard, { dataTransfer: payload, altKey: true })
    expect(onDropToFolder).toHaveBeenCalledWith('/root/Pictures', ['/root/photo.jpg'], false)
  })

  it('renders empty states in list and card views and ignores malformed folder drops', () => {
    const props = { paneId: 'left' as const, files: [], selected: new Set<string>(), renamingPath: null,
      sort: { key: 'name' as const, dir: 1 as const }, onSortChange: vi.fn(), onItemClick: vi.fn(), onItemDoubleClick: vi.fn(),
      onRenameConfirm: vi.fn(), onRenameCancel: vi.fn(), onItemContextMenu: vi.fn() }
    const { rerender, container } = render(<FileList {...props} view="list" />)
    expect(screen.getByText('fileList.noFiles')).toBeInTheDocument()
    rerender(<FileList {...props} view="grid" />)
    expect(screen.getByText('fileList.noFiles')).toBeInTheDocument()

    rerender(<FileList {...props} files={[entry('folder', true)]} view="list" onDropToFolder={vi.fn()} />)
    const folderRow = container.querySelector('[data-file-path="/root/folder"]')!
    fireEvent.drop(folderRow, { dataTransfer: { types: ['application/x-clive-paths'], getData: () => '{bad json}' } })
  })
})
