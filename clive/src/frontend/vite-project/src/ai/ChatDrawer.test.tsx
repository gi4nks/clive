// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

import { CANCELLED_SENTINEL } from './chat.js'

// Keys pass through verbatim (T7 owns chat.* translations); tests assert on
// structure/roles and stable substrings, never on localized copy.
// initReactI18next is required by the real ../i18n module, which chat.ts
// reaches transitively via safety.ts — the mock must expose it.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

import { ChatDrawer } from './ChatDrawer.js'

// Minimal fake controller matching ChatController shape.
const makeAI = (over: Partial<any> = {}) => ({
  messages: [], streaming: false, busy: false, error: '', addedFiles: [], historyTruncated: false,
  send: vi.fn(), abort: vi.fn(), applyAction: vi.fn(), cancelAction: vi.fn(),
  validateAction: vi.fn(() => ({ ok: true })),
  reset: vi.fn(), addFile: vi.fn(), removeAdded: vi.fn(), ...over,
})

describe('ChatDrawer', () => {
  afterEach(cleanup)

  it('renders nothing when closed', () => {
    const { container } = render(<ChatDrawer open={false} onClose={vi.fn()} ai={makeAI() as never} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders header + input when open', () => {
    render(<ChatDrawer open={true} onClose={vi.fn()} ai={makeAI() as never} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('closes on Esc', () => {
    const onClose = vi.fn()
    render(<ChatDrawer open={true} onClose={onClose} ai={makeAI() as never} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('renders action card with Apply/Cancel', () => {
    const ai = makeAI({
      messages: [
        { role: 'user', content: 'rinomina' },
        { role: 'assistant', content: 'ok', actions: [{ type: 'rename', file: '/a', newName: 'b' }] },
      ],
    })
    render(<ChatDrawer open={true} onClose={vi.fn()} ai={ai as never} />)
    expect(screen.getByText(/b/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /apply/i }).length).toBeGreaterThan(0)
  })

  it('renders a createFolder action card', () => {
    const ai = makeAI({
      messages: [
        { role: 'user', content: 'crea cartelle' },
        { role: 'assistant', content: 'ok', actions: [{ type: 'createFolder', folder: 'Organizzato/00 Inbox' }] },
      ],
    })
    render(<ChatDrawer open={true} onClose={vi.fn()} ai={ai as never} />)
    expect(screen.getByText('Organizzato/00 Inbox')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /apply/i }).length).toBeGreaterThan(0)
  })

  it('hides cards whose action is structurally unsatisfiable (target outside current dir)', () => {
    const ai = makeAI({
      messages: [
        { role: 'user', content: 'x' },
        { role: 'assistant', content: 'ok', actions: [{ type: 'create', file: '/Desktop/Organizzato/00 Inbox/.keep', content: '' }] },
      ],
      validateAction: vi.fn(() => ({ ok: false, error: 'target outside current dir' })),
    })
    render(<ChatDrawer open={true} onClose={vi.fn()} ai={ai as never} />)
    expect(screen.queryByText('.keep')).toBeNull()
    expect(screen.queryAllByRole('button', { name: /apply/i })).toHaveLength(0)
  })

  it('cancelled action shows chat.cancelled via CANCELLED_SENTINEL contract', () => {
    const ai = makeAI({
      messages: [
        { role: 'assistant', content: 'ok', actions: [{ type: 'rename', file: '/a', newName: 'b' }], actionsApplied: [true], actionErrors: [CANCELLED_SENTINEL] },
      ],
    })
    render(<ChatDrawer open={true} onClose={vi.fn()} ai={ai as never} />)
    expect(screen.getByText(/chat\.cancelled/)).toBeInTheDocument()
    expect(screen.queryByText(/chat-cancelled/)).not.toBeInTheDocument()
  })

  it('calls ai.addFile for each dropped file', () => {
    const ai = makeAI()
    render(<ChatDrawer open={true} onClose={vi.fn()} ai={ai as never} />)
    const dropTarget = screen.getByTestId('chat-drop-target')
    const file = { name: 'x.txt', size: 1, lastModified: 0, path: '/tmp/x.txt' }
    fireEvent.drop(dropTarget, { dataTransfer: { files: [file] } })
    expect(ai.addFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'x.txt', path: '/tmp/x.txt' }))
  })

  it('renders guard-blocked card disabled with hint (no Apply click required)', () => {
    const ai = makeAI({
      validateAction: vi.fn().mockReturnValue({ ok: false, error: 'system location' }),
      messages: [
        { role: 'user', content: 'del' },
        { role: 'assistant', content: 'ok', actions: [{ type: 'trash', file: '/Applications' }] },
      ],
    })
    render(<ChatDrawer open={true} onClose={vi.fn()} ai={ai as never} />)
    expect(screen.getByText(/system location/i)).toBeInTheDocument()
    const applyBtn = screen.getByRole('button', { name: /apply/i })
    expect(applyBtn).toBeDisabled()
  })

  it('shows truncation chip when ai.historyTruncated is true', () => {
    const ai = makeAI({ historyTruncated: true })
    render(<ChatDrawer open={true} onClose={vi.fn()} ai={ai as never} />)
    expect(screen.getByText(/chat.truncated|trimmed|rimossi/i)).toBeInTheDocument()
  })

  it('renders assistant markdown: bold becomes <strong>', () => {
    const ai = makeAI({ messages: [{ role: 'assistant', content: 'a **bold** word' }] })
    const { container } = render(<ChatDrawer open={true} onClose={vi.fn()} ai={ai as never} />)
    const strong = container.querySelector('strong')
    expect(strong?.textContent).toBe('bold')
  })

  it('renders assistant markdown: fenced code becomes <code>', () => {
    const ai = makeAI({ messages: [{ role: 'assistant', content: '```\nconst x = 1\n```' }] })
    const { container } = render(<ChatDrawer open={true} onClose={vi.fn()} ai={ai as never} />)
    const code = container.querySelector('pre code')
    expect(code?.textContent).toContain('const x = 1')
  })

  it('🪄 button on an assistant message calls onCreatePlan with the raw content', () => {
    const onCreatePlan = vi.fn()
    const ai = makeAI({
      messages: [
        { role: 'user', content: 'organizza' },
        { role: 'assistant', content: 'analisi **completa**' },
      ],
    })
    render(<ChatDrawer open={true} onClose={vi.fn()} ai={ai as never} onCreatePlan={onCreatePlan} />)
    const wand = screen.getByRole('button', { name: /plan\.createBtn/i })
    fireEvent.click(wand)
    expect(onCreatePlan).toHaveBeenCalledWith('analisi **completa**')
  })

  it('no 🪄 button on user messages nor when onCreatePlan is absent', () => {
    const ai = makeAI({ messages: [{ role: 'user', content: 'ciao' }] })
    render(<ChatDrawer open={true} onClose={vi.fn()} ai={ai as never} onCreatePlan={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /plan\.createBtn/i })).not.toBeInTheDocument()
  })

  it('🪄 is disabled with plan.tooBig title when canPlan is false (R7)', () => {
    const onCreatePlan = vi.fn()
    const ai = makeAI({ messages: [{ role: 'assistant', content: 'x' }] })
    render(
      <ChatDrawer
        open={true}
        onClose={vi.fn()}
        ai={ai as never}
        onCreatePlan={onCreatePlan}
        canPlan={false}
      />,
    )
    const wand = screen.getByRole('button', { name: /plan\.createBtn/i })
    expect(wand).toBeDisabled()
    expect(wand).toHaveAttribute('title', 'plan.tooBig')
    fireEvent.click(wand)
    expect(onCreatePlan).not.toHaveBeenCalled()
  })

  it('🪄 is disabled while the assistant message is still streaming (Minor 4)', () => {
    const onCreatePlan = vi.fn()
    const ai = makeAI({ messages: [{ role: 'assistant', content: 'parti', streaming: true }] })
    render(<ChatDrawer open={true} onClose={vi.fn()} ai={ai as never} onCreatePlan={onCreatePlan} />)
    const wand = screen.getByRole('button', { name: /plan\.createBtn/i })
    expect(wand).toBeDisabled()
    fireEvent.click(wand)
    expect(onCreatePlan).not.toHaveBeenCalled()
  })

  it('copy button writes raw markdown to clipboard and confirms with Copiato!', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const ai = makeAI({ messages: [{ role: 'assistant', content: 'a **bold** word' }] })
    render(<ChatDrawer open={true} onClose={vi.fn()} ai={ai as never} />)
    const btn = screen.getByRole('button', { name: /ai\.copy/i })
    fireEvent.click(btn)
    await act(async () => {})
    expect(writeText).toHaveBeenCalledWith('a **bold** word')
    expect(screen.getByText('chat.copied')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.queryByText('Copiato!')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})
