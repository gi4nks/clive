// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AiWorkspace, type AiWorkspaceProps } from './AiWorkspace.js'
import type { AiController } from './useAi.js'

vi.mock('./ChatDrawer.js', () => ({ ChatDrawer: ({ open }: { open: boolean }) => <div data-testid="chat-drawer" data-open={open} /> }))
afterEach(cleanup)

const makeAi = (overrides: Record<string, unknown> = {}) => ({
  busy: null, hasPreview: false, summary: '', rows: null, organize: null, gen: null,
  journal: null, error: '', excluded: new Set<string>(), abort: vi.fn(), cancel: vi.fn(),
  apply: vi.fn(), undo: vi.fn(), setGen: vi.fn(), setRows: vi.fn(), toggleExcluded: vi.fn(),
  ...overrides,
}) as unknown as AiController

function renderWorkspace(props: Partial<AiWorkspaceProps> = {}) {
  const callbacks = {
    onChatClose: vi.fn(), onChatOpen: vi.fn(), onPlanOpen: vi.fn(),
  }
  const ai = props.ai ?? makeAi({ busy: 'generate' })
  const workspaceProps = {
    ai, chat: {} as never, chatOpen: false, ...callbacks,
    currentPath: '/work', location: { kind: 'local' }, selectedCount: 2,
    planOpen: true, ...props,
  } as AiWorkspaceProps
  return { ...render(<AiWorkspace {...workspaceProps} />), ai, ...callbacks }
}

describe('AiWorkspace', () => {
  it('stays closed when no chat or quick action is active', () => {
    const { container } = renderWorkspace({ ai: makeAi() })
    expect(container).toBeEmptyDOMElement()
  })

  it('switches between action and chat surfaces and forwards plan navigation', () => {
    const { ai, onChatClose, onChatOpen, onPlanOpen } = renderWorkspace({
      ai: makeAi({ hasPreview: true, summary: 'Preview' }),
      location: { kind: 'network' },
    })
    expect(screen.getByText('Preview')).toBeInTheDocument()
    expect(screen.getByText(/network/)).toBeInTheDocument()
    expect(screen.getByText(/2/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Chat' }))
    expect(onChatOpen).toHaveBeenCalledOnce()
    expect(screen.getByTestId('chat-drawer')).toHaveAttribute('data-open', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))
    expect(onPlanOpen).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
    expect(onChatClose).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onChatClose).toHaveBeenCalledOnce()
    expect(ai.cancel).toHaveBeenCalledOnce()
  })

  it('aborts a running quick action when the user closes the backdrop or header', () => {
    const { ai, container } = renderWorkspace({ ai: makeAi({ busy: 'generate' }) })
    fireEvent.click(container.querySelector('[aria-hidden="true"]')!)
    expect(ai.abort).toHaveBeenCalledOnce()
  })

  it('closes the chat when the chat surface is already active', () => {
    const { onChatClose } = renderWorkspace({ ai: makeAi(), chatOpen: true })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onChatClose).toHaveBeenCalledOnce()
  })
})
