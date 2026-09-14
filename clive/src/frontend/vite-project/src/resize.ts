/**
 * Pure sizing helpers for resizable panes (kept separate so they can be
 * unit-tested without the DOM).
 */
export const SIDEBAR_MIN = 160
export const SIDEBAR_MAX = 560

/** List-column width limits (px) for the resizable name/size/date columns. */
export const COL_MIN = 80
export const COL_MAX = 900
/** Minimum readable width kept for the flexible date column. */
export const DATE_COL_MIN = 96
/** Non-column space consumed by a list row: px-3 padding (24) + two gap-3 (24). */
export const LIST_GRID_OVERHEAD = 48

/**
 * Scale the configured name/size column widths so the row grid fits inside a
 * pane of `avail` px. Fixed px columns saved when a pane was wide must shrink
 * when the pane shrinks (e.g. the dual pane opens), proportionally, never
 * below COL_MIN and never grown beyond the configured values.
 */
export function fitColWidths(avail: number, name: number, size: number): { name: number; size: number } {
  if (!Number.isFinite(avail) || avail <= 0) return { name, size }
  const budget = avail - LIST_GRID_OVERHEAD - DATE_COL_MIN
  if (budget >= name + size) return { name, size }
  if (budget <= 2 * COL_MIN) return { name: COL_MIN, size: COL_MIN }
  let [n, s] = [name, size]
  for (let i = 0; i < 2; i++) {
    const fixed = (n <= COL_MIN ? COL_MIN : 0) + (s <= COL_MIN ? COL_MIN : 0)
    const flexCount = (n > COL_MIN ? 1 : 0) + (s > COL_MIN ? 1 : 0)
    if (!flexCount) break
    const k = (budget - fixed) / ((n > COL_MIN ? n : 0) + (s > COL_MIN ? s : 0))
    if (n > COL_MIN) n = Math.max(COL_MIN, n * k)
    if (s > COL_MIN) s = Math.max(COL_MIN, s * k)
  }
  return { name: n, size: s }
}

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

/** Smallest usable width for one dual pane (px): below this the split drag stops. */
export const PANE_MIN = 320

/**
 * Clamp the split ratio so BOTH panes keep at least PANE_MIN px inside a
 * container of `containerW` px. If the container is narrower than two
 * PANE_MIN panes, the split recenters (CSS min-width takes over from there).
 */
export function clampSplitPct(containerW: number, pct: number): number {
  if (!Number.isFinite(containerW) || containerW <= 0) return 0.5
  const hardMin = Math.max(0.15, PANE_MIN / containerW)
  const max = 1 - hardMin
  if (max <= hardMin) return 0.5
  return Math.min(max, Math.max(hardMin, pct))
}
