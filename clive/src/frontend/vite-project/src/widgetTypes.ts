import type { FC } from 'react'
import type { ClipboardInfo, FileEntry } from './api'
import type { MenuItem } from './ContextMenu'
import type { AiController } from './ai/useAi'

export type Placement = 'left' | 'center' | 'right'

/** State + actions handed to every status-bar widget. Kept small and explicit
 *  so each widget can be mounted/tested in isolation with a stub. */
export interface WidgetCtx {
  // state
  currentPath: string
  home: string
  entries: FileEntry[]
  selectedEntries: FileEntry[]
  clip: ClipboardInfo
  pasteInFlight: boolean
  hiddenVisible: boolean
  searchQuery: string
  // actions
  navigate: (path: string) => void
  refresh: () => void
  setHiddenVisible: (v: boolean) => void
  setSearchQuery: (v: string) => void
  copyCut: (op: 'copy' | 'move') => void
  paste: () => void
  clearClipboard: () => void
  openTerminalHere: () => void
  setStatus: (msg: string, kind: 'success' | 'error' | 'info') => void
  actionsFor: (target: FileEntry | FileEntry[]) => MenuItem[]
  ai: AiController
}

export interface Widget {
  id: string
  placement: Placement
  order: number
  /** When true and the bar is narrow, this widget collapses into the ⋯ menu. */
  collapsible?: boolean
  Component: FC<{ ctx: WidgetCtx }>
  visible?: (ctx: WidgetCtx) => boolean
}
