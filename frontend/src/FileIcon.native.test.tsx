// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FileIcon } from './FileIcon'
import { loadNativeIcons } from './nativeFileIcons'
import type { FileEntry } from './api'

const { getFileIconsMock } = vi.hoisted(() => ({ getFileIconsMock: vi.fn() }))

vi.mock('./api', async (importOriginal) => ({
  ...await importOriginal<typeof import('./api')>(),
  getFileIcons: getFileIconsMock,
}))

const entry: FileEntry = {
  name: 'report.pdf', path: '/docs/report.pdf', isDir: false, size: 12, modified: 34, extension: 'pdf',
}

describe('native file icons', () => {
  beforeEach(() => getFileIconsMock.mockReset())

  it('updates the rendered icon when the asynchronous native icon arrives', async () => {
    getFileIconsMock.mockResolvedValue([{ path: entry.path, dataUrl: 'data:image/png;base64,bmF0aXZl' }])
    render(<FileIcon entry={entry} />)

    await act(async () => { await loadNativeIcons([entry]) })

    await waitFor(() => expect(screen.getByRole('img')).toHaveProperty('tagName', 'IMG'))
    expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,bmF0aXZl')
  })
})
