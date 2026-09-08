/**
 * Pure sizing helpers for resizable panes (kept separate so they can be
 * unit-tested without the DOM).
 */
export const SIDEBAR_MIN = 160
export const SIDEBAR_MAX = 560

/** List-column width limits (px) for the resizable name/size/date columns. */
export const COL_MIN = 80
export const COL_MAX = 900

export type PaneCollapsed = { left: boolean; right: boolean }

/**
 * Toggle collapse for `target`, enforcing: at least one pane stays expanded,
 * and expanding is always allowed. Returns the next state (or same if the
 * collapse is rejected).
 */
export function collapsePane(prev: PaneCollapsed, target: 'left' | 'right'): PaneCollapsed {
  if (prev[target]) return { ...prev, [target]: false }
  const other = target === 'left' ? 'right' : 'left'
  if (prev[other]) return prev // would leave zero expanded — refuse
  return { ...prev, [target]: true }
}

/** Vertical label for a collapsed rail: basename, 'Home', or '/'. */
export function railLabel(path: string, home: string): string {
  if (!path) return ''
  if (path === home) return 'Home'
  if (path === '/') return '/'
  const trimmed = path.replace(/\/+$/, '')
  const base = trimmed.slice(trimmed.lastIndexOf('/') + 1)
  return base || '/'
}

/** Clamp to [min, max]; non-finite input falls back to `min` (safe default). */
export function clampWidth(v: number, min = SIDEBAR_MIN, max = SIDEBAR_MAX): number {
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, v))
}
