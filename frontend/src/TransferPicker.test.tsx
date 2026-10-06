// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import i18n from './i18n'
import { TransferPicker } from './TransferPicker'

beforeEach(async () => {
  await i18n.changeLanguage('en')
})
afterEach(() => cleanup())

const base = {
  open: true,
  mode: 'move' as const,
  count: 1,
  home: '/home/u',
  recents: [],
  onClose: vi.fn(),
  onConfirm: vi.fn(),
}

describe('TransferPicker', () => {
  it('shows an "Other pane" target pointing at the other pane path', () => {
    render(<TransferPicker {...base} currentPath="/home/u/Projects" otherPanePath="/Users" />)
    expect(screen.getByText('Other pane')).toBeInTheDocument()
    const opt = screen.getByRole('button', { name: /Users/ })
    expect(opt).toBeInTheDocument()
  })
  it('hides "Other pane" when both panes share the same directory', () => {
    render(<TransferPicker {...base} currentPath="/home/u" otherPanePath="/home/u" />)
    expect(screen.queryByText('Other pane')).not.toBeInTheDocument()
  })
  it('hides "Other pane" when no other path is provided', () => {
    render(<TransferPicker {...base} currentPath="/home/u" />)
    expect(screen.queryByText('Other pane')).not.toBeInTheDocument()
  })
})
