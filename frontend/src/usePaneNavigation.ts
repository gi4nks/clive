import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import type { PaneId, PaneState } from './FilePane.js'

type PaneMap<T> = Record<PaneId, T>
type PaneRef = { current: PaneMap<PaneState> }
type PanePatch = (id: PaneId, update: (pane: PaneState) => PaneState) => void

interface PaneNavigationOptions {
  active: PaneId
  currentPath: string
  panesRef: PaneRef
  patch: PanePatch
  refreshPane: (id: PaneId, path: string) => Promise<void>
  setRecents: Dispatch<SetStateAction<string[]>>
  setEditingPath: Dispatch<SetStateAction<boolean>>
  closeContextMenu: () => void
}

/** Owns per-pane path history and the navigation transitions around a session. */
export function usePaneNavigation({
  active,
  currentPath,
  panesRef,
  patch,
  refreshPane,
  setRecents,
  setEditingPath,
  closeContextMenu,
}: PaneNavigationOptions) {
  const [backHistory, setBackHistory] = useState<PaneMap<string[]>>({ left: [], right: [] })
  const [forwardHistory, setForwardHistory] = useState<PaneMap<string[]>>({ left: [], right: [] })
  const backStack = backHistory[active]
  const fwdStack = forwardHistory[active]

  const refresh = useCallback((path: string) => refreshPane(active, path), [active, refreshPane])

  const navigatePane = useCallback(async (id: PaneId, path: string, pushHistory = true) => {
    patch(id, (pane) => ({ ...pane, selected: new Set(), anchorPath: null, renamingPath: null, query: '', path }))
    if (id === active) setEditingPath(false)
    closeContextMenu()
    if (pushHistory && id === active) {
      const previousPath = panesRef.current[id].path
      if (previousPath && previousPath !== path) {
        setBackHistory((history) => ({ ...history, [id]: [...history[id], previousPath] }))
      }
      setForwardHistory((history) => ({ ...history, [id]: [] }))
    }
    setRecents((recent) => [path, ...recent.filter((entry) => entry !== path)].slice(0, 12))
    await refreshPane(id, path)
  }, [active, patch, setEditingPath, closeContextMenu, panesRef, setRecents, refreshPane])

  const navigate = useCallback((path: string, pushHistory = true) => {
    return navigatePane(active, path, pushHistory)
  }, [active, navigatePane])

  const goUp = useCallback(async () => {
    const parent = currentPath !== '/' ? currentPath.replace(/\/[^/]*$/, '') : ''
    if (parent && parent !== currentPath) await navigate(parent || '/')
  }, [currentPath, navigate])

  const goBack = useCallback(async () => {
    const previousPath = backStack.at(-1)
    if (!previousPath) return
    const id = active
    setBackHistory((history) => ({ ...history, [id]: history[id].slice(0, -1) }))
    setForwardHistory((history) => ({ ...history, [id]: [...history[id], currentPath] }))
    await navigatePane(id, previousPath, false)
  }, [backStack, active, currentPath, navigatePane])

  const goForward = useCallback(async () => {
    const nextPath = fwdStack.at(-1)
    if (!nextPath) return
    const id = active
    setForwardHistory((history) => ({ ...history, [id]: history[id].slice(0, -1) }))
    setBackHistory((history) => ({ ...history, [id]: [...history[id], currentPath] }))
    await navigatePane(id, nextPath, false)
  }, [fwdStack, active, currentPath, navigatePane])

  return {
    navigatePane,
    navigate,
    refresh,
    goUp,
    goBack,
    goForward,
    canGoBack: backStack.length > 0,
    canGoForward: fwdStack.length > 0,
  }
}
