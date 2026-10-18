// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTransferWorkflow } from './useTransferWorkflow'

const mocks = vi.hoisted(() => ({
  clearClipboard: vi.fn(),
  copyPaths: vi.fn(),
  cutPaths: vi.fn(),
  getClipboard: vi.fn(),
  openTerminal: vi.fn(),
  pastePaths: vi.fn(),
  transferBatch: vi.fn(),
}))

vi.mock('./api.js', () => ({
  clearClipboard: mocks.clearClipboard,
  copyPaths: mocks.copyPaths,
  cutPaths: mocks.cutPaths,
  getClipboard: mocks.getClipboard,
  openTerminal: mocks.openTerminal,
  pastePaths: mocks.pastePaths,
}))

vi.mock('./transfer.js', () => ({ transferBatch: mocks.transferBatch }))

describe('useTransferWorkflow', () => {
  const options = {
    active: 'left' as const,
    currentPath: '/destination',
    panesRef: { current: {
      left: { path: '/source', entries: [], selected: new Set<string>(), anchorPath: null, renamingPath: null, query: '', loading: false },
      right: { path: '/destination', entries: [], selected: new Set<string>(), anchorPath: null, renamingPath: null, query: '', loading: false },
    } },
    setPanes: vi.fn(),
    selectedEntries: [{ path: '/source/item.txt' }],
    refresh: vi.fn().mockResolvedValue(undefined),
    refreshPane: vi.fn().mockResolvedValue(undefined),
    expandPane: vi.fn(),
    assertWritable: vi.fn().mockReturnValue(true),
    setStatus: vi.fn(),
  } as unknown as Parameters<typeof useTransferWorkflow>[0]

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getClipboard.mockResolvedValue({ paths: [], operation: null })
    mocks.transferBatch.mockResolvedValue({ applied: 1, nonAtomic: false, failures: [] })
  })

  it('owns the transfer and refreshes both pane listings after applying it', async () => {
    const { result } = renderHook(() => useTransferWorkflow(options))

    await act(async () => {
      await result.current.applyTransfer('/destination', ['/source/item.txt'], 'copy')
    })

    expect(mocks.transferBatch).toHaveBeenCalledWith(['/source/item.txt'], '/destination', 'copy')
    expect(options.refreshPane).toHaveBeenCalledWith('left', '/source')
    expect(options.refreshPane).toHaveBeenCalledWith('right', '/destination')
    await waitFor(() => expect(options.setStatus).toHaveBeenCalled())
  })

  it('does not transfer paths into an archive destination', async () => {
    const { result } = renderHook(() => useTransferWorkflow(options))

    await act(async () => {
      await result.current.applyTransfer('/archive.zip!/folder', ['/source/item.txt'], 'move')
    })

    expect(mocks.transferBatch).not.toHaveBeenCalled()
    expect(options.refreshPane).not.toHaveBeenCalled()
  })

  it('guards copy and cut, refreshes clipboard state, and reports failures', async () => {
    const { result, rerender } = renderHook(({ opts }) => useTransferWorkflow(opts), { initialProps: { opts: options } })
    await waitFor(() => expect(mocks.getClipboard).toHaveBeenCalled())
    await act(async () => result.current.handleCopyCut('copy'))
    expect(mocks.copyPaths).toHaveBeenCalledWith(['/source/item.txt'])
    expect(options.setStatus).toHaveBeenCalled()

    mocks.cutPaths.mockRejectedValueOnce(new Error('clipboard unavailable'))
    await act(async () => result.current.handleCopyCut('move'))
    expect(options.setStatus).toHaveBeenLastCalledWith('Error: clipboard unavailable', 'error')

    const denied = { ...options, assertWritable: vi.fn().mockReturnValue(false) }
    rerender({ opts: denied as unknown as typeof options })
    await act(async () => result.current.handleCopyCut('copy'))
    expect(mocks.copyPaths).toHaveBeenCalledTimes(1)
  })

  it('pastes clipboard entries, clears clipboard, and handles an empty or failing paste', async () => {
    mocks.getClipboard.mockResolvedValueOnce({ paths: ['/source/a'], operation: 'copy' })
      .mockResolvedValueOnce({ paths: [], operation: null })
    const { result } = renderHook(() => useTransferWorkflow(options))
    await waitFor(() => expect(result.current.clip.paths).toEqual(['/source/a']))
    await act(async () => result.current.handlePaste())
    expect(mocks.pastePaths).toHaveBeenCalledWith('/destination')
    expect(options.refresh).toHaveBeenCalledWith('/destination')
    expect(result.current.clip.paths).toEqual([])
    expect(result.current.pasteInFlight).toBe(false)

    await act(async () => result.current.handleClearClip())
    expect(mocks.clearClipboard).toHaveBeenCalledOnce()

    mocks.getClipboard.mockResolvedValueOnce({ paths: ['/source/b'], operation: 'move' })
    const second = renderHook(() => useTransferWorkflow(options))
    await waitFor(() => expect(second.result.current.clip.paths).toEqual(['/source/b']))
    mocks.pastePaths.mockRejectedValueOnce(new Error('paste denied'))
    await act(async () => second.result.current.handlePaste())
    expect(options.setStatus).toHaveBeenLastCalledWith('Error: paste denied', 'error')
  })

  it('skips empty and same-folder drops, swaps panes, and transfers to the other pane', async () => {
    options.panesRef.current.left.selected.add('/source/item.txt')
    const { result } = renderHook(() => useTransferWorkflow(options))
    await act(async () => {
      await result.current.applyTransfer('/destination', [], 'copy')
      result.current.dropIntoPane('right', ['/destination/a.txt'], false)
      result.current.dropToDir('', ['/source/item.txt'], false)
    })
    expect(mocks.transferBatch).not.toHaveBeenCalled()

    await act(async () => result.current.swapPanes())
    expect(options.setPanes).toHaveBeenCalled()
    await act(async () => result.current.sendToOtherPane('move'))
    expect(options.expandPane).toHaveBeenCalledWith('right')
    expect(mocks.transferBatch).toHaveBeenCalledWith(['/source/item.txt'], '/destination', 'move')
  })

  it('reports partial and non-atomic transfer outcomes', async () => {
    mocks.transferBatch.mockResolvedValueOnce({ applied: 0, nonAtomic: true, failures: [{ error: 'busy' }] })
    const { result } = renderHook(() => useTransferWorkflow(options))
    await act(async () => result.current.applyTransfer('/destination', ['/source/a'], 'copy'))
    expect(options.setStatus).toHaveBeenCalledWith(expect.stringContaining('crossed volumes'), 'info')
    expect(options.setStatus).toHaveBeenCalledWith(expect.stringMatching(/failed/), 'error')
    expect(options.refreshPane).toHaveBeenCalledTimes(2)
  })
})
