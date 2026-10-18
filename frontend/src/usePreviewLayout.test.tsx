// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePreviewLayout } from './usePreviewLayout'

describe('usePreviewLayout', () => {
  it('restores the activated pane when leaving expanded preview', () => {
    const setPaneCollapseState = vi.fn()
    const setActivePane = vi.fn()
    const options = {
      enabled: true,
      paneCollapseState: { left: true, right: true },
      setPaneCollapseState,
      expandPane: vi.fn(),
      setActivePane,
    }
    const { result } = renderHook(() => usePreviewLayout(options))

    act(() => result.current.togglePreviewExpanded())
    expect(result.current.previewExpanded).toBe(true)

    act(() => result.current.activatePane('right'))

    expect(result.current.previewExpanded).toBe(false)
    expect(setPaneCollapseState).toHaveBeenCalledWith({ left: true, right: false })
    expect(setActivePane).toHaveBeenCalledWith('right')
  })

  it('closes expanded preview when the preview feature is disabled', () => {
    const { result, rerender } = renderHook(({ enabled }) => usePreviewLayout({
      enabled,
      paneCollapseState: { left: false, right: false },
      setPaneCollapseState: vi.fn(),
      expandPane: vi.fn(),
      setActivePane: vi.fn(),
    }), { initialProps: { enabled: true } })

    act(() => result.current.togglePreviewExpanded())
    rerender({ enabled: false })

    expect(result.current.previewExpanded).toBe(false)
  })
})
