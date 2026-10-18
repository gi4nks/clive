// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AiOverlay } from './AiOverlay.js'
import type { AiController } from './useAi.js'

afterEach(cleanup)

function controller(overrides: Record<string, unknown> = {}) {
  return {
    busy: null,
    hasPreview: false,
    summary: '',
    rows: null,
    organize: null,
    gen: null,
    journal: null,
    error: '',
    excluded: new Set<string>(),
    abort: vi.fn(),
    apply: vi.fn(),
    cancel: vi.fn(),
    undo: vi.fn(),
    setGen: vi.fn(),
    setRows: vi.fn(),
    toggleExcluded: vi.fn(),
    ...overrides,
  } as unknown as AiController
}

describe('AiOverlay', () => {
  it('stays hidden when there is no active work, preview, journal, or error', () => {
    const { container } = render(<AiOverlay ai={controller()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the pending state and aborts work from the close control', () => {
    const ai = controller({ busy: 'generate' })
    render(<AiOverlay ai={ai} />)
    expect(screen.getByText('Working…')).toBeInTheDocument()
    expect(screen.getByText('Please wait, contacting the model…')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Close'))
    expect(ai.abort).toHaveBeenCalledOnce()
  })

  it('renders summary and exposes copy and dismiss actions for an error', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const ai = controller({ summary: 'A useful summary', hasPreview: true, error: 'Provider unreachable' })
    render(<AiOverlay ai={ai} />)
    expect(screen.getByText('A useful summary')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Copy/ }))
    expect(writeText).toHaveBeenCalledWith('Provider unreachable')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(ai.cancel).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(ai.apply).toHaveBeenCalledOnce()
  })

  it('edits generated content and supports embedded mode without a header', () => {
    const ai = controller({ gen: { name: 'draft.md', body: 'Draft' }, hasPreview: true })
    const { container } = render(<AiOverlay ai={ai} embedded showHeader={false} />)
    expect(container.firstElementChild).toHaveClass('h-full', 'w-full')
    fireEvent.change(screen.getByDisplayValue('draft.md'), { target: { value: 'final.md' } })
    expect(ai.setGen).toHaveBeenCalledWith({ name: 'final.md', body: 'Draft' })
    fireEvent.change(screen.getByDisplayValue('Draft'), { target: { value: 'Final' } })
    expect(ai.setGen).toHaveBeenCalledWith({ name: 'draft.md', body: 'Final' })
  })

  it('edits valid rename rows and marks invalid rows disabled', () => {
    const rows = [
      { path: '/a.txt', from: 'a.txt', to: 'new-a.txt', ok: true },
      { path: '/b.txt', from: 'b.txt', to: 'new-b.txt', ok: false, error: 'Collision' },
    ]
    const ai = controller({ rows, hasPreview: true })
    render(<AiOverlay ai={ai} />)
    const inputs = screen.getAllByRole('textbox')
    expect(inputs[1]).toBeDisabled()
    fireEvent.change(inputs[0], { target: { value: 'renamed.txt' } })
    expect(ai.setRows).toHaveBeenCalledWith([
      { ...rows[0], to: 'renamed.txt' }, rows[1],
    ])
    expect(screen.getByTitle('Collision')).toBeInTheDocument()
  })

  it('renders organize exclusions, unknown entries, and the journal undo control', () => {
    const ai = controller({
      organize: { folders: ['Docs'], moves: [{ src: '/work/a.txt', dst: '/work/Docs/a.txt', dstFolder: 'Docs' }], unknown: ['mystery.bin'] },
      excluded: new Set(['/work/a.txt']),
      journal: 'batch-1',
      hasPreview: true,
    })
    render(<AiOverlay ai={ai} />)
    expect(screen.getByText(/mystery.bin|unknown/i)).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(ai.toggleExcluded).toHaveBeenCalledWith('/work/a.txt')
    fireEvent.click(screen.getByRole('button', { name: /Undo changes/ }))
    expect(ai.undo).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(ai.cancel).toHaveBeenCalledOnce()
  })

  it('cancels a running summary and does not allow apply while a request is busy', () => {
    const ai = controller({ busy: 'summarize', summary: 'Partial output', hasPreview: true })
    render(<AiOverlay ai={ai} />)
    const apply = screen.getByRole('button', { name: 'Cancel' })
    fireEvent.click(apply)
    expect(ai.cancel).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
  })
})
