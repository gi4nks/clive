// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}))

vi.mock('./runtime.js', () => ({
  checkHealth: vi.fn().mockResolvedValue({ ok: true, providers: {} }),
  resolveGatewayBase: vi.fn().mockResolvedValue('http://127.0.0.1:1234/v1'),
}))

import { AiDebugModal } from './AiDebugModal.js'

describe('AiDebugModal', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(cleanup)

  it('renders as a real dialog and closes from its close button', () => {
    const onClose = vi.fn()
    render(<AiDebugModal open={true} onClose={onClose} />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'AI Magic Debugger' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Chiudi' }).at(-1)!)
    expect(onClose).toHaveBeenCalled()
  })

  it('renders nothing when closed', () => {
    render(<AiDebugModal open={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
