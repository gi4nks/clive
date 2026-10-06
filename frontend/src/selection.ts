/**
 * Pure selection helpers (feature: combined mouse+keyboard multi-selection).
 * Geometry of the rubber-band and keyboard range math, kept out of the
 * components so they are unit-testable without a DOM.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Axis-aligned intersection (the marquee and item rects share one space). */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

export function marqueePaths(items: { path: string; rect: Rect }[], box: Rect): string[] {
  return items.filter((i) => rectsIntersect(box, i.rect)).map((i) => i.path)
}

/** Inclusive range of paths between `from` and `to` (either order). */
export function rangePaths(paths: string[], from: string, to: string): string[] {
  const a = paths.indexOf(from)
  const b = paths.indexOf(to)
  if (a < 0 || b < 0) return []
  const [lo, hi] = a <= b ? [a, b] : [b, a]
  return paths.slice(lo, hi + 1)
}

/**
 * Result of a keyboard selection step.
 * `anchor` is the pivot of the range (stays fixed while extending);
 * `path` is the newly focused row; `range` is what becomes selected.
 */
export function stepRange(
  paths: string[],
  anchor: string | null,
  selected: Set<string>,
  delta: number | 'first' | 'last',
): { path: string; range: string[] } | null {
  if (!paths.length) return null
  const pivot = anchor && paths.includes(anchor) ? anchor : (selected.size ? [...selected][selected.size - 1] : null)
  if (pivot === null) {
    const first = delta === 'last' ? paths[paths.length - 1] : paths[0]
    return { path: first, range: [first] }
  }
  const pivotIdx = paths.indexOf(pivot)
  // The "active end" is the selection extreme farthest from the pivot; arrows move it.
  const idxs = [...selected].map((p) => paths.indexOf(p)).filter((i) => i >= 0)
  const far = idxs.length
    ? idxs.reduce((acc, i) => (Math.abs(i - pivotIdx) >= Math.abs(acc - pivotIdx) ? i : acc), pivotIdx)
    : pivotIdx
  const target = delta === 'first' ? 0 : delta === 'last' ? paths.length - 1 : Math.max(0, Math.min(paths.length - 1, far + (delta as number)))
  return { path: paths[target], range: rangePaths(paths, pivot, paths[target]) }
}
