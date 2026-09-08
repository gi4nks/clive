/**
 * Sidebar/pinned-locations pure logic (pinned-sidebar change).
 * Shared by the Sidebar component and the per-pane "Go to" menu so the two can
 * never drift. No React, no I/O → unit-testable.
 */
import { basename } from './ai/safety'

export interface Place {
  /** i18n key under places.* */
  labelKey: string
  path: string
}

/** Fixed system places, resolved against the user's home. Not removable. */
export function placesFor(home: string): Place[] {
  if (!home) return []
  const subs: Array<[string, string]> = [
    ['desktop', 'Desktop'],
    ['documents', 'Documents'],
    ['downloads', 'Downloads'],
    ['pictures', 'Pictures'],
    ['music', 'Music'],
  ]
  return [{ labelKey: 'home', path: home }, ...subs.map(([k, s]) => ({ labelKey: k, path: `${home}/${s}` }))]
}

export const MAX_PINNED = 30

/** Add (dedup, cap) — returns a new array or the same reference if unchanged. */
export function pinPath(pinned: string[], path: string): string[] {
  if (!path || pinned.includes(path)) return pinned
  const next = [...pinned, path]
  return next.length > MAX_PINNED ? next.slice(0, MAX_PINNED) : next
}

export function unpinPath(pinned: string[], path: string): string[] {
  return pinned.filter((p) => p !== path)
}

/** Move `path` to index `to` (clamp). Returns new array. */
export function reorderPinned(pinned: string[], path: string, to: number): string[] {
  const from = pinned.indexOf(path)
  if (from < 0) return pinned
  const next = [...pinned]
  next.splice(from, 1)
  const target = Math.max(0, Math.min(next.length, to))
  next.splice(target, 0, path)
  return next
}

/** Display label for a pinned path (basename). */
export function pinnedLabel(path: string): string {
  return basename(path.replace(/\/+$/, '')) || path
}
