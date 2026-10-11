export type PaneCollapseState = { left: boolean; right: boolean }
export type PaneId = keyof PaneCollapseState

/** Restore the saved pane layout, optionally expanding the pane the user selected. */
export function restorePaneCollapseState(
  current: PaneCollapseState,
  activatedPane?: PaneId,
): PaneCollapseState {
  return activatedPane ? { ...current, [activatedPane]: false } : { ...current }
}
