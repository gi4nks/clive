import { useCallback, useEffect, useRef, useState } from 'react'
import type { PaneId, PaneState } from './FilePane.js'

export const blankPane = (): PaneState => ({
  path: '', entries: [], selected: new Set(), anchorPath: null,
  renamingPath: null, query: '', loading: false,
})

/** Owns dual-pane session state and exposes a stable mutation seam. Navigation
 * transitions and per-pane history are composed through usePaneNavigation. */
export function usePaneSession() {
  const [panes, setPanes] = useState<Record<PaneId, PaneState>>({ left: blankPane(), right: blankPane() })
  const [active, setActive] = useState<PaneId>('left')
  const panesRef = useRef(panes)
  const activeRef = useRef(active)

  useEffect(() => {
    panesRef.current = panes
    activeRef.current = active
  })

  const patch = useCallback((id: PaneId, fn: (pane: PaneState) => PaneState) => {
    setPanes((prev) => ({ ...prev, [id]: fn(prev[id]) }))
  }, [])
  const patchActive = useCallback((fn: (pane: PaneState) => PaneState) => patch(activeRef.current, fn), [patch])

  return { panes, setPanes, active, setActive, panesRef, activeRef, patch, patchActive, blankPane }
}
