// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
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

  it('does not turn a file row into a folder drop target', () => {
    const onDrop = vi.fn()
    renderList(onDrop)
    const fileRow = document.querySelector('[data-file-path="/root/a.txt"]')!
    // no onDragOver handler on non-dir rows -> no preventDefault / no call
    fireEvent.drop(fileRow, dt(['/root/a.txt']))
    expect(onDrop).not.toHaveBeenCalled()
  })
})
