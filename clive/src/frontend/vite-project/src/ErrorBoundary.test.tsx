// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import i18n from './i18n'
import { ErrorBoundary } from './ErrorBoundary'

let boom = true
const Child = () => {
  if (boom) throw new Error('kaputt')
  return <span>child-ok</span>
}
const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
import { vi } from 'vitest'

beforeEach(async () => {
  cleanup()
  boom = true
  await i18n.changeLanguage('en')
})
afterEach(() => cleanup())

describe('ErrorBoundary', () => {
  it('shows a retry card when a child crashes and recovers on retry', () => {
    render(
      <ErrorBoundary name="widget">
        <Child />
      </ErrorBoundary>,
    )
    expect(screen.getByText('This component crashed')).toBeInTheDocument()
    expect(document.querySelector('[data-error-boundary="widget"]')).not.toBeNull()
    boom = false
    fireEvent.click(screen.getByText('Retry'))
    expect(screen.getByText('child-ok')).toBeInTheDocument()
  })
})
