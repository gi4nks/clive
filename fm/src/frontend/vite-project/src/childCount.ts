/**
 * Folder first-level counts (files+subdirs, plus a "has subdir" flag), cached
 * at module level so multiple `ChildCountBadge` instances hitting the same
 * path only pay one `listDir`. Invalidation is triggered by the App on every
 * pane refresh (v1: simple global clear — see spec).
 *
 * States are explicit so the badge can render `…` vs `—` vs `N`/`N+` without
 * inspecting shapes.
 */
import { listDir } from './api.js'

export type ChildCountValue =
  | { state: 'ok'; total: number; hasSubdirs: boolean }
  | { state: 'error' }

const cache = new Map<string, ChildCountValue>()
const inflight = new Map<string, Promise<ChildCountValue>>()

async function fetchCount(path: string): Promise<ChildCountValue> {
  const entries = await listDir(path, false)
  return {
    state: 'ok',
    total: entries.length,
    hasSubdirs: entries.some((e) => e.isDir),
  }
}

/** Cache-first count with in-flight dedup. Never rejects; failures resolve as `{state:'error'}`. */
export function getChildCount(path: string): Promise<ChildCountValue> {
  const cached = cache.get(path)
  if (cached) return Promise.resolve(cached)
  const flying = inflight.get(path)
  if (flying) return flying
  const p = fetchCount(path)
    .then((v) => {
      cache.set(path, v)
      return v
    })
    .catch(() => {
      const err: ChildCountValue = { state: 'error' }
      cache.set(path, err)
      return err
    })
    .finally(() => {
      inflight.delete(path)
    })
  inflight.set(path, p)
  return p
}

/**
 * Drop cached entries. Without `path`: clear everything. With `path`: drop
 * that path plus every descendant (`path/…`). Pending inflight promises are
 * NOT cancelled (they'll finish and re-populate the cache); call sites that
 * need strict "no stale after this" should also await their mutation.
 */
export function invalidateChildCount(path?: string): void {
  if (path === undefined) {
    cache.clear()
    inflight.clear()
    return
  }
  const prefix = path === '/' ? '/' : path + '/'
  for (const k of [...cache.keys()]) {
    if (k === path || k.startsWith(prefix)) cache.delete(k)
  }
  for (const k of [...inflight.keys()]) {
    if (k === path || k.startsWith(prefix)) inflight.delete(k)
  }
}
