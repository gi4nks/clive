// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { blankPane, usePaneSession } from './usePaneSession'
import { usePaneNavigation } from './usePaneNavigation'

describe('usePaneNavigation', () => {
  it('keeps back and forward history independent for each pane', async () => {
    const refreshPane = vi.fn().mockResolvedValue(undefined)
    const closeContextMenu = vi.fn()
    const { result, rerender } = renderHook(({ active }) => {
      const session = usePaneSession()
      const [recents, setRecents] = useState<string[]>([])
      const [editing, setEditingPath] = useState(false)
      const navigation = usePaneNavigation({
        active,
        currentPath: session.panes[active].path,
        panesRef: session.panesRef,
        patch: session.patch,
        refreshPane,
        setRecents,
        setEditingPath,
        closeContextMenu,
      })
      return { session, navigation, recents, editing }
    }, { initialProps: { active: 'left' as const } })

    act(() => result.current.session.setPanes({
      left: { ...blankPane(), path: '/left' },
      right: { ...blankPane(), path: '/right' },
    }))

    await act(async () => { await result.current.navigation.navigatePane('left', '/left/one') })
    await act(async () => { await result.current.navigation.navigatePane('left', '/left/two') })
    expect(result.current.navigation.canGoBack).toBe(true)

    rerender({ active: 'right' })
    await act(async () => { await result.current.navigation.navigatePane('right', '/right/one') })
    await act(async () => { await result.current.navigation.navigatePane('right', '/right/two') })
    await act(async () => { await result.current.navigation.goBack() })
    expect(result.current.session.panes.right.path).toBe('/right/one')

    rerender({ active: 'left' })
    expect(result.current.navigation.canGoBack).toBe(true)
    await act(async () => { await result.current.navigation.goBack() })
    expect(result.current.session.panes.left.path).toBe('/left/one')
    expect(result.current.navigation.canGoForward).toBe(true)
    await act(async () => { await result.current.navigation.goForward() })
    expect(result.current.session.panes.left.path).toBe('/left/two')
    await act(async () => { await result.current.navigation.navigatePane('left', '/left/branch') })
    expect(result.current.navigation.canGoForward).toBe(false)
    expect(refreshPane).toHaveBeenCalledWith('right', '/right/one')
    expect(closeContextMenu).toHaveBeenCalled()
  })
})
