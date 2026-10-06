import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { ChildCountBadge } from './ChildCountBadge.js'
import * as childCount from './childCount.js'

vi.mock('./childCount.js', () => ({ getChildCount: vi.fn() }))
const getChildCountMock = childCount.getChildCount as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  getChildCountMock.mockReset()
})
afterEach(cleanup)

describe('ChildCountBadge', () => {
  it('renders … while pending', () => {
    getChildCountMock.mockReturnValue(new Promise(() => {}))
    render(<ChildCountBadge path="/x" />)
    expect(screen.getByTestId('child-count').textContent).toBe('…')
  })

  it('renders N for a folder without subdirs', async () => {
    getChildCountMock.mockResolvedValueOnce({ state: 'ok', total: 42, hasSubdirs: false })
    render(<ChildCountBadge path="/x" />)
    await waitFor(() => expect(screen.getByTestId('child-count').textContent).toBe('42'))
  })

  it('renders N+ for a folder with subdirs', async () => {
    getChildCountMock.mockResolvedValueOnce({ state: 'ok', total: 12, hasSubdirs: true })
    render(<ChildCountBadge path="/x" />)
    await waitFor(() => expect(screen.getByTestId('child-count').textContent).toBe('12+'))
  })

  it('renders 0 for an empty folder', async () => {
    getChildCountMock.mockResolvedValueOnce({ state: 'ok', total: 0, hasSubdirs: false })
    render(<ChildCountBadge path="/x" />)
    await waitFor(() => expect(screen.getByTestId('child-count').textContent).toBe('0'))
  })

  it('renders — on error', async () => {
    getChildCountMock.mockResolvedValueOnce({ state: 'error' })
    render(<ChildCountBadge path="/x" />)
    await waitFor(() => expect(screen.getByTestId('child-count').textContent).toBe('—'))
  })

  it('refetches when path changes', async () => {
    getChildCountMock.mockResolvedValueOnce({ state: 'ok', total: 1, hasSubdirs: false })
    const { rerender } = render(<ChildCountBadge path="/a" />)
    await waitFor(() => expect(screen.getByTestId('child-count').textContent).toBe('1'))
    getChildCountMock.mockResolvedValueOnce({ state: 'ok', total: 5, hasSubdirs: true })
    rerender(<ChildCountBadge path="/b" />)
    await waitFor(() => expect(screen.getByTestId('child-count').textContent).toBe('5+'))
    expect(getChildCountMock).toHaveBeenCalledWith('/b')
  })
})
