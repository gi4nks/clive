import { useEffect, useState } from 'react'
import { getChildCount, type ChildCountValue } from './childCount.js'

type BadgeState = { state: 'pending' } | ChildCountValue

/**
 * Renders a folder's first-level entry count: `N` (no subdirs) or `N+`
 * (has subdirs). `…` while loading, `—` on error or when the path is unreadable.
 */
export function ChildCountBadge({ path }: { path: string }) {
  const [s, setS] = useState<BadgeState>({ state: 'pending' })
  useEffect(() => {
    let alive = true
    setS({ state: 'pending' })
    void getChildCount(path).then((v) => {
      if (alive) setS(v)
    })
    return () => {
      alive = false
    }
  }, [path])
  const label = s.state === 'pending' ? '…' : s.state === 'error' ? '—' : `${s.total}${s.hasSubdirs ? '+' : ''}`
  return <span data-testid="child-count" className="text-right text-xs tabular-nums text-base-content/60">{label}</span>
}
