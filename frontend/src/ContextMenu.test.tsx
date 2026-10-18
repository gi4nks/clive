// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ContextMenu } from './ContextMenu'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('ContextMenu', () => {
  it('renders separators and disabled items, then selects and closes an action', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<ContextMenu x={20} y={30} onClose={onClose} items={[
      { key: 'disabled', label: 'Disabled', disabled: true, onSelect },
      { key: 'separator', separator: true },
      { key: 'go', label: 'Open', hint: '↵', onSelect },
    ]} />)
    expect(document.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Disabled/ }))
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Open/ }))
    expect(onSelect).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('clamps to the viewport and closes for escape, blur, wheel, and a background click', () => {
    const onClose = vi.fn()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 120, height: 60, left: 0, top: 0, right: 120, bottom: 60, x: 0, y: 0, toJSON: () => ({}),
    })
    const { container, unmount } = render(<ContextMenu x={990} y={750} onClose={onClose} items={[]} />)
    const menu = container.querySelector('.menu') as HTMLDivElement
    expect(menu.style.left).toBe('870px')
    expect(menu.style.top).toBe('690px')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
    unmount()

    const second = render(<ContextMenu x={10} y={10} onClose={onClose} items={[]} />)
    fireEvent.blur(window)
    fireEvent.wheel(window)
    fireEvent.click(second.container.firstChild!)
    expect(onClose.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('stops menu mouse-down propagation and closes on a second context click', () => {
    const onClose = vi.fn()
    const { container } = render(<ContextMenu x={10} y={10} onClose={onClose} items={[]} />)
    const root = container.firstElementChild!
    const menu = container.querySelector('.menu')!
    fireEvent.mouseDown(menu)
    expect(onClose).not.toHaveBeenCalled()
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    root.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
