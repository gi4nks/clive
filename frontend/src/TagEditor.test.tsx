// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { getFileTags, setFilesTags } from './api'
import { TagEditor } from './TagEditor'
import './i18n'

vi.mock('./api', () => ({ getFileTags: vi.fn(), setFilesTags: vi.fn() }))

describe('TagEditor', () => {
  const paths = ['/folder/a.txt', '/folder/b.txt']
  const onClose = vi.fn()
  const onApplied = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getFileTags).mockResolvedValue([
      [paths[0], [{ name: 'Work', color: 4 }]],
      [paths[1], []],
    ])
    vi.mocked(setFilesTags).mockResolvedValue(undefined)
  })
  afterEach(cleanup)

  it('merges tags, toggles them across paths, adds a color, and applies the batch', async () => {
    render(<TagEditor paths={paths} onClose={onClose} onApplied={onApplied} />)
    expect(await screen.findByText('Work')).toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.change(screen.getByPlaceholderText('New tag name'), { target: { value: '  Personal  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Blue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByText('Personal')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save tags' }))
    await waitFor(() => expect(onApplied).toHaveBeenCalledOnce())
    expect(setFilesTags).toHaveBeenCalledWith([
      { path: paths[0], tags: [{ name: 'Work', color: 4 }, { name: 'Personal', color: 4 }] },
      { path: paths[1], tags: [{ name: 'Work', color: 4 }, { name: 'Personal', color: 4 }] },
    ])
  })

  it('reports invalid names and persistence errors, and closes from the backdrop', async () => {
    render(<TagEditor paths={paths} onClose={onClose} onApplied={onApplied} />)
    await screen.findByText('Work')
    fireEvent.change(screen.getByPlaceholderText('New tag name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    vi.mocked(setFilesTags).mockRejectedValueOnce(new Error('write denied'))
    fireEvent.click(screen.getByRole('button', { name: 'Save tags' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('write denied')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onApplied).not.toHaveBeenCalled()
  })
})
