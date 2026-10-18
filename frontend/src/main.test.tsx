// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'

const { renderRoot } = vi.hoisted(() => ({ renderRoot: vi.fn() }))
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: renderRoot }) }))
vi.mock('./App.tsx', () => ({ default: () => <div>Clive</div> }))

describe('frontend entry point', () => {
  it('marks the native theme and mounts the app into the root element', async () => {
    document.body.innerHTML = '<div id="root"></div>'
    await import('./main.tsx')

    expect(document.documentElement).toHaveClass('macos-native')
    expect(renderRoot).toHaveBeenCalledOnce()
    expect(renderRoot.mock.calls[0][0]).toBeTruthy()
  })
})
