// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readTextFile } from '../api'
import { collectFileContents } from './fs'
import type { FileEntry } from '../api'

vi.mock('../api', () => ({ readTextFile: vi.fn() }))

const entry = (name: string, path: string, size: number, isDir = false): FileEntry => ({
  name, path, size, isDir, modified: 0, extension: null,
})

describe('collectFileContents', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads only small files, keeps directory and large-file metadata, and tolerates read errors', async () => {
    vi.mocked(readTextFile).mockImplementation(async (path) => {
      if (path === '/broken.txt') throw new Error('unreadable')
      return `contents:${path}`
    })
    const results = await collectFileContents([
      entry('small.txt', '/small.txt', 12),
      entry('broken.txt', '/broken.txt', 12),
      entry('large.txt', '/large.txt', 512 * 1024 + 1),
      entry('folder', '/folder', 0, true),
    ])
    expect(readTextFile).toHaveBeenCalledTimes(2)
    expect(results).toEqual([
      { path: '/small.txt', name: 'small.txt', size: 12, isDir: false, text: 'contents:/small.txt' },
      { path: '/broken.txt', name: 'broken.txt', size: 12, isDir: false, text: null },
      { path: '/large.txt', name: 'large.txt', size: 512 * 1024 + 1, isDir: false, text: null },
      { path: '/folder', name: 'folder', size: 0, isDir: true, text: null },
    ])
  })
})
