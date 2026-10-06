import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { applyPlan, undoPlan, onPlanProgress } from '../api.js'
import type { ApplyReport, PlanProgress } from '../api.js'
import type { Plan, PlanOp } from './plan.js'
import { validateFolderPath } from './plan.js'
import { validateNewName } from './safety.js'
import { addDebugEvent, getDebugLog, updateDebugLog, type PlanDebugApply } from './usePlanDebug.js'
import { proposalFromPlan } from './proposal.js'

/** Panel lifecycle. Task 5 renders on these values:
 * - 'review'   → tree + checkboxes, Apply enabled
 * - 'applying' → progress bar (apply OR undo in flight)
 * - 'applied'  → report + "Annulla tutto"
 * - 'undone'   → terminal after a successful undo (undoReport set)
 * - 'error'    → error banner (message in `error`); batchId/report preserved for retry
 */
export type PlanPhase = 'idle' | 'review' | 'applying' | 'applied' | 'undone' | 'error'

/** Local panel edits. Only the key matching the op's kind is honored. */
export type PlanOpPatch = { path?: string; newName?: string; destDir?: string }

const newBatchId = (): string => {
  const c = (globalThis.crypto ?? {}) as Crypto & { randomUUID?: () => string }
  return c.randomUUID?.() ?? `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Panel rename edits: same safety layer the one-shot flow uses, plus the
 * backslash the Rust rename rejects (validateNewName doesn't check it). */
const isBadName = (n: string): boolean =>
  !validateNewName(n).ok || n.includes('\\')

const emptyDebugApply = (ops: PlanOp[]): PlanDebugApply => ({
  status: 'pending', startedAt: Date.now(), totalOps: ops.length,
  includedOps: ops.filter((o) => o.included && !o.issue).length,
  excludedOps: ops.filter((o) => !o.included || !!o.issue).length,
  opsByKind: {},
})

const getDebugApply = (id: string): PlanDebugApply | undefined => getDebugLog(id)?.apply

/** Progress events improve observability but must never be a prerequisite for
 * the filesystem operation. In particular, an older/stale Tauri bundle may
 * reject plugin:event|listen through ACL even though apply_plan is available. */
const tryProgressSubscription = async (debugId: string | undefined, callback: (progress: PlanProgress) => void) => {
  try {
    return await onPlanProgress(callback)
  } catch (e) {
    if (debugId) addDebugEvent(debugId, {
      stage: 'apply', type: 'error', detail: 'progress-subscription-failed',
      metadata: { error: e instanceof Error ? e.message : String(e) },
    })
    return null
  }
}

export function usePlan() {
  const [plan, setPlanState] = useState<Plan | null>(null)
  const [phase, setPhase] = useState<PlanPhase>('idle')
  const [progress, setProgress] = useState<PlanProgress | null>(null)
  const [report, setReport] = useState<ApplyReport | null>(null)
  const [undoReport, setUndoReport] = useState<ApplyReport | null>(null)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const planRef = useRef<Plan | null>(null)
  planRef.current = plan
  const batchRef = useRef<string | null>(null)
  batchRef.current = batchId
  const unsubRef = useRef<(() => void | Promise<void>) | null>(null)
  /** Origin-based (R12): op ids whose issue came from expandPlan (present at
   * setPlan time) are authoritative FOREVER for this plan instance. We key on
   * origin, never on issue strings — plan.ts may legitimately emit strings
   * that coincide with updateOp's local ones. */
  const authoritativeRef = useRef<Set<string>>(new Set())
  const aliveRef = useRef(true)
  const proposal = useMemo(() => (plan ? proposalFromPlan(plan) : null), [plan])

  const stopProgress = () => {
    void unsubRef.current?.()
    unsubRef.current = null
  }
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      stopProgress()
    }
  }, [])

  const resetRun = () => {
    setReport(null)
    setUndoReport(null)
    setBatchId(null)
    setProgress(null)
    setError(null)
  }

  const setPlan = useCallback((p: Plan) => {
    stopProgress()
    authoritativeRef.current = new Set(p.ops.filter((o) => o.issue).map((o) => o.id))
    setPlanState(p)
    setPhase('review')
    resetRun()
  }, [])

  const close = useCallback(() => {
    stopProgress()
    authoritativeRef.current = new Set()
    setPlanState(null)
    setPhase('idle')
    resetRun()
  }, [])

  const mutate = (fn: (o: PlanOp) => PlanOp) =>
    setPlanState((p) => (p ? { ...p, ops: p.ops.map(fn) } : p))

  /** Flip included; an op carrying an `issue` — or authoritative from the
   * moment the plan arrived — can NEVER be enabled (spec §5.2). */
  const toggleOp = useCallback((id: string) => {
    mutate((o) =>
      o.id === id
        ? { ...o, included: o.issue || authoritativeRef.current.has(o.id) ? false : !o.included }
        : o,
    )
  }, [])

  /** Panel folder-path edits must satisfy the same rules expandPlan enforced:
   * stay inside the plan root, relative to it, with valid segments (no `..`
   * traversal, absolute escapes or empty segments). Rust stays authoritative;
   * this restores the client-side invariant (review I-2). */
  const folderEditIssue = (absPath: string): string | null => {
    const rootPath = planRef.current?.rootPath
    const p = absPath.replace(/\/+$/, '')
    if (!p.trim()) return 'empty path'
    if (!rootPath) return null
    const root = rootPath.replace(/\/+$/, '') || '/'
    const prefix = root === '/' ? '/' : `${root}/`
    const rel = p === root ? '' : p.startsWith(prefix) ? p.slice(prefix.length) : null
    if (rel === null) return 'invalid folder path'
    return validateFolderPath(rel).ok ? null : 'invalid folder path'
  }

  const updateOp = useCallback((id: string, patch: PlanOpPatch) => {
    // Authoritative ops are locked: edits are rejected outright, so their
    // issue can neither be overwritten nor cleared (origin-based, R12).
    if (authoritativeRef.current.has(id)) return
    mutate((o) => {
      if (o.id !== id) return o
      let next: PlanOp = o
      let issue: string | null = null
      if (o.kind === 'createFolder' && patch.path !== undefined) {
        next = { ...o, path: patch.path }
        issue = folderEditIssue(patch.path)
      } else if (o.kind === 'rename' && patch.newName !== undefined) {
        next = { ...o, newName: patch.newName }
        if (isBadName(patch.newName)) issue = 'invalid name'
      } else if (o.kind === 'move' && patch.destDir !== undefined) {
        next = { ...o, destDir: patch.destDir }
        if (!patch.destDir.trim()) issue = 'empty destination'
      }
      if (issue) return { ...next, issue, included: false }
      if (next.issue) {
        // non-authoritative op: any issue it carries was introduced by an
        // earlier updateOp, so a valid re-edit legitimately clears it
        const { issue: _drop, ...rest } = next
        return rest as PlanOp
      }
      return next
    })
  }, [])

  const apply = useCallback(async () => {
    const p = planRef.current
    if (!p) return
    const id = newBatchId()
    stopProgress()
    setBatchId(id)
    setReport(null)
    setUndoReport(null)
    setError(null)
    setProgress(null)
    setPhase('applying')
    const included = p.ops.filter((o) => o.included && !o.issue)
    const semantic = proposalFromPlan(p)
    const opsByKind = included.reduce<Record<string, number>>((acc, o) => {
      acc[o.kind] = (acc[o.kind] ?? 0) + 1
      return acc
    }, {})
    const applyStarted = Date.now()
    if (p.debugId) addDebugEvent(p.debugId, { stage: 'apply', type: 'start', metadata: { total: p.ops.length, included: included.length, risk: semantic.risk, review: semantic.review } })
    if (p.debugId) updateDebugLog(p.debugId, {
      apply: {
        status: 'pending', startedAt: applyStarted, batchId: id,
        totalOps: p.ops.length, includedOps: included.length,
        excludedOps: p.ops.length - included.length, opsByKind,
        payload: included,
      },
    })
    try {
      const unsub = await tryProgressSubscription(p.debugId, (progress) => {
        setProgress(progress)
        if (p.debugId) updateDebugLog(p.debugId, { apply: { ...(getDebugApply(p.debugId) ?? emptyDebugApply(p.ops)), progress } })
      })
      if (!aliveRef.current) {
        void unsub?.()
        return
      }
      unsubRef.current = unsub
      const r = await applyPlan(id, included)
      setReport(r)
      setPhase('applied')
      if (p.debugId) updateDebugLog(p.debugId, { apply: {
        ...(getDebugApply(p.debugId) ?? emptyDebugApply(p.ops)),
        status: 'success', startedAt: applyStarted, finishedAt: Date.now(), batchId: id,
        totalOps: p.ops.length, includedOps: included.length,
        excludedOps: p.ops.length - included.length, opsByKind,
        payload: included, report: r,
      } })
      if (p.debugId) addDebugEvent(p.debugId, { stage: 'apply', type: 'success', durationMs: Date.now() - applyStarted, metadata: { applied: r.applied, skipped: r.skipped, failed: r.failed.length } })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
      if (p.debugId) updateDebugLog(p.debugId, { apply: {
        ...(getDebugApply(p.debugId) ?? emptyDebugApply(p.ops)),
        status: 'error', startedAt: applyStarted, finishedAt: Date.now(), batchId: id,
        totalOps: p.ops.length, includedOps: included.length,
        excludedOps: p.ops.length - included.length, opsByKind,
        payload: included, errorDetails: e instanceof Error ? e.message : String(e),
      } })
      if (p.debugId) addDebugEvent(p.debugId, { stage: 'apply', type: 'error', durationMs: Date.now() - applyStarted, detail: e instanceof Error ? e.message : String(e) })
    } finally {
      stopProgress()
      setProgress(null)
    }
  }, [])

  const undo = useCallback(async () => {
    const id = batchRef.current
    if (!id) return
    stopProgress()
    setError(null)
    setProgress(null)
    setPhase('applying')
    const undoPlanRef = planRef.current
    const undoStarted = Date.now()
    if (undoPlanRef?.debugId) addDebugEvent(undoPlanRef.debugId, { stage: 'undo', type: 'start' })
    try {
      const unsub = await tryProgressSubscription(undoPlanRef?.debugId, (progress) => {
        setProgress(progress)
        if (undoPlanRef?.debugId) updateDebugLog(undoPlanRef.debugId, { apply: { ...(getDebugApply(undoPlanRef.debugId) ?? emptyDebugApply(undoPlanRef.ops)), progress } })
      })
      if (!aliveRef.current) {
        void unsub?.()
        return
      }
      unsubRef.current = unsub
      const r = await undoPlan(id)
      setUndoReport(r)
      setPhase(r.failed.length ? 'applied' : 'undone')
      if (planRef.current?.debugId) updateDebugLog(planRef.current.debugId, {
        apply: { ...(getDebugApply(planRef.current.debugId) ?? emptyDebugApply(planRef.current.ops)), status: 'success', finishedAt: Date.now(), report: { undo: r } },
      })
      if (planRef.current?.debugId) addDebugEvent(planRef.current.debugId, { stage: 'undo', type: 'success', durationMs: Date.now() - undoStarted, metadata: { applied: r.applied, skipped: r.skipped, failed: r.failed.length } })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('applied')
      if (planRef.current?.debugId) updateDebugLog(planRef.current.debugId, {
        apply: { ...(getDebugApply(planRef.current.debugId) ?? emptyDebugApply(planRef.current.ops)), status: 'error', finishedAt: Date.now(), errorDetails: `undo: ${e instanceof Error ? e.message : String(e)}` },
      })
      if (planRef.current?.debugId) addDebugEvent(planRef.current.debugId, { stage: 'undo', type: 'error', durationMs: Date.now() - undoStarted, detail: e instanceof Error ? e.message : String(e) })
    } finally {
      stopProgress()
      setProgress(null)
    }
  }, [])

  return { plan, proposal, phase, progress, report, undoReport, batchId, error, setPlan, close, toggleOp, updateOp, apply, undo }
}
