// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { ConfirmDialog } from './ConfirmDialog'
import { confirmAsk } from './confirm'

afterEach(cleanup)

describe('ConfirmDialog', () => {
  it('resolves false when dismissed from the backdrop', async () => {
    const answer = confirmAsk('Continue?', { title: 'Confirm' })
    const { container } = render(<ConfirmDialog />)

    fireEvent.click(container.querySelector('.modal-backdrop')!)

    await expect(answer).resolves.toBe(false)
  })
})
