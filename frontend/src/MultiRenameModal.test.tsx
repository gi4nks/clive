// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import i18n from './i18n'
import { MultiRenameModal } from './MultiRenameModal'
import type { FileEntry } from './api'

const files = (names: string[]): FileEntry[] =>
  names.map((n) => ({ name: n, path: `/d/${n}`, isDir: false, size: 1, modified: 1757000000, extension: n.split('.').pop()! }))

beforeEach(async () => { cleanup(); await i18n.changeLanguage('en') })
afterEach(() => cleanup())

const renderModal = (names: string[], onApply = vi.fn()) => {
  render(<MultiRenameModal open entries={files(names)} onClose={vi.fn()} onApply={onApply} />)
  return onApply
}

describe('MultiRenameModal', () => {
  it('expands the pattern live into the new column', () => {
    renderModal(['a.txt', 'b.txt'])
    const pattern = screen.getByPlaceholderText(/IMG_/)
    fireEvent.change(pattern, { target: { value: 'IMG_{n>2}' } })
    expect(screen.getByDisplayValue('IMG_01')).toBeInTheDocument()
    expect(screen.getByDisplayValue('IMG_02')).toBeInTheDocument()
  })

  it('blocks apply on duplicates and re-enables after editing one row', () => {
    const onApply = renderModal(['a.txt', 'b.txt'])
    fireEvent.change(screen.getByPlaceholderText(/IMG_/), { target: { value: 'same' } })
    expect(screen.getAllByText('duplicate')).toHaveLength(1)
    expect(screen.getByText('1 to rename')).toBeInTheDocument()
    const inputs = screen.getAllByDisplayValue('same').slice(1) // drop the pattern input
    fireEvent.change(inputs[1], { target: { value: 'other' } })
    fireEvent.click(screen.getByText('Apply'))
    expect(onApply).toHaveBeenCalledWith([
      { path: '/d/a.txt', newName: 'same' },
      { path: '/d/b.txt', newName: 'other' },
    ])
  })

  it('excluded rows are not applied; unchanged names skipped', () => {
    const onApply = renderModal(['a.txt', 'b.txt'])
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(screen.getByText('Apply'))
    expect(onApply).not.toHaveBeenCalled() // only b remains and it already equals target a? b target 'b.txt' equals its name → skipped
  })
})
