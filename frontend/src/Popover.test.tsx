// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Popover } from './Popover'

afterEach(cleanup)

describe('Popover', () => {
  it('opens, keeps internal scrolls, and closes on Escape and outside interaction', () => {
    const onOpen = vi.fn()
    const onOpenChange = vi.fn()
    const { container, rerender } = render(<><Popover label="menu" buttonTitle="Options" onOpen={onOpen} onOpenChange={onOpenChange}><div>Panel body</div></Popover><button>Outside</button></>)
    fireEvent.click(screen.getByTitle('Options'))
    expect(onOpen).toHaveBeenCalledOnce()
    expect(screen.getByRole('group')).toBeInTheDocument()
    fireEvent.scroll(screen.getByRole('group'))
    expect(screen.getByRole('group')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    fireEvent.click(screen.getByTitle('Options'))
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('group')).not.toBeInTheDocument()

    rerender(<Popover label="disabled" buttonTitle="Disabled" disabled><div>hidden</div></Popover>)
    fireEvent.click(screen.getByTitle('Disabled'))
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(container.querySelector('button')).toBeDisabled()
  })

  it('updates a controlled popover without changing its own visibility', () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(<Popover label="controlled" buttonTitle="Controlled" open={false} onOpenChange={onOpenChange}><div>Controlled body</div></Popover>)
    fireEvent.click(screen.getByTitle('Controlled'))
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(screen.queryByText('Controlled body')).not.toBeInTheDocument()
    rerender(<Popover label="controlled" buttonTitle="Controlled" open onOpenChange={onOpenChange}><div>Controlled body</div></Popover>)
    expect(screen.getByText('Controlled body')).toBeInTheDocument()
  })
})
