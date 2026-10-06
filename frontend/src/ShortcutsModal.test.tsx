// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import i18n from './i18n'
import { ShortcutsModal } from './ShortcutsModal'

beforeEach(async () => {
  cleanup()
  await i18n.changeLanguage('en')
})
afterEach(() => cleanup())

describe('ShortcutsModal', () => {
  it('renders grouped shortcut rows with kbd chips', () => {
    render(<ShortcutsModal open onClose={vi.fn()} />)
    expect(screen.getByText('Keyboard shortcuts')).toBeInTheDocument()
    expect(screen.getByText('Focus mode (hide other pane)')).toBeInTheDocument()
    expect(document.querySelectorAll('kbd').length).toBeGreaterThan(20)
  })
  it('renders nothing when closed', () => {
    render(<ShortcutsModal open={false} onClose={vi.fn()} />)
    expect(screen.queryByText('Keyboard shortcuts')).not.toBeInTheDocument()
  })
})
