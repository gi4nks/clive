// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
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

  it('confirms a recent destination and excludes the current directory from recents', () => {
    const onConfirm = vi.fn()
    render(<TransferPicker {...base} currentPath="/home/u/Projects" recents={['/home/u/Projects', '/tmp/archive']} onConfirm={onConfirm} />)
    expect(screen.getByText('archive')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /archive/ }))
    expect(onConfirm).toHaveBeenCalledWith('/tmp/archive')
  })

  it('requires a non-empty custom path, trims it on Enter, and closes on Escape or cancel', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(<TransferPicker {...base} currentPath="/home/u" onConfirm={onConfirm} onClose={onClose} />)
    const input = screen.getByPlaceholderText('Destination path…')
    const go = screen.getByRole('button', { name: 'Go' })
    expect(go).toBeDisabled()
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onConfirm).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: ' /tmp/target ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onConfirm).toHaveBeenCalledWith('/tmp/target')
    fireEvent.click(go)
    expect(onConfirm).toHaveBeenLastCalledWith('/tmp/target')
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('does not render when closed and closes from the backdrop', () => {
    const onClose = vi.fn()
    const { rerender, container } = render(<TransferPicker {...base} open={false} currentPath="/home/u" onClose={onClose} />)
    expect(container.firstChild).toBeNull()
    rerender(<TransferPicker {...base} currentPath="/home/u" onClose={onClose} />)
    fireEvent.click(container.querySelector('.modal-backdrop')!)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
