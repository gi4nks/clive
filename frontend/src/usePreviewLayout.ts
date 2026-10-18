import { useCallback, useEffect, useState } from 'react'
import type { PaneId } from './FilePane.js'
import type { AppConfig } from './settings/appConfig.js'
import { restorePaneCollapseState } from './previewLayout.js'

interface PreviewLayoutOptions {
  enabled: boolean
  paneCollapseState: AppConfig['paneCollapsed']
  setPaneCollapseState: (state: AppConfig['paneCollapsed']) => void
  expandPane: (id: PaneId) => void
  setActivePane: (id: PaneId) => void
}

/** Owns the expanded-preview layout mode and its interaction with pane focus. */
export function usePreviewLayout({
  enabled,
  paneCollapseState,
  setPaneCollapseState,
  expandPane,
  setActivePane,
}: PreviewLayoutOptions) {
  const [previewExpanded, setPreviewExpanded] = useState(false)

  useEffect(() => {
    if (!enabled) {
      // Reset ephemeral mode after the persisted setting changes elsewhere.
      // oxlint-disable-next-line react/set-state-in-effect
      setPreviewExpanded(false)
    }
  }, [enabled])

  const activatePane = useCallback((id: PaneId) => {
    setPreviewExpanded(false)
    if (previewExpanded) setPaneCollapseState(restorePaneCollapseState(paneCollapseState, id))
    else expandPane(id)
    setActivePane(id)
  }, [previewExpanded, paneCollapseState, setPaneCollapseState, expandPane, setActivePane])

  const togglePreviewExpanded = useCallback(() => {
    if (previewExpanded) {
      setPreviewExpanded(false)
      setPaneCollapseState(restorePaneCollapseState(paneCollapseState))
    } else {
      setPreviewExpanded(true)
    }
  }, [previewExpanded, paneCollapseState, setPaneCollapseState])

  return { previewExpanded, setPreviewExpanded, activatePane, togglePreviewExpanded }
}
