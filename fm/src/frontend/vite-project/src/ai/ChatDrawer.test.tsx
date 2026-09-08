// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

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
  messages: [], streaming: false, busy: false, error: '', addedFiles: [],
  send: vi.fn(), abort: vi.fn(), applyAction: vi.fn(), cancelAction: vi.fn(),
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
})
