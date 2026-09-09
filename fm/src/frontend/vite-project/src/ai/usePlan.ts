import { useCallback, useEffect, useRef, useState } from 'react'
import { applyPlan, undoPlan, onPlanProgress } from '../api.js'
import type { ApplyReport, PlanProgress } from '../api.js'
import type { Plan, PlanOp } from './plan.js'

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

/** Issues produced by updateOp; only these are cleared by a valid re-edit.
 * Deep issues from expandPlan ('protected', 'target exists', 'not found', …)
 * are permanent (spec §7: issue ops are non-enableable). */
const LOCAL_ISSUES = new Set(['empty path', 'invalid name', 'empty destination'])

const newBatchId = (): string => {
  const c = (globalThis.crypto ?? {}) as Crypto & { randomUUID?: () => string }
  return c.randomUUID?.() ?? `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const isBadName = (n: string): boolean =>
  !n.trim() || n === '.' || n === '..' || n.includes('/') || n.includes('\\')

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

  const stopProgress = () => {
    void unsubRef.current?.()
    unsubRef.current = null
  }
  useEffect(() => stopProgress, [])

  const resetRun = () => {
    setReport(null)
    setUndoReport(null)
    setBatchId(null)
    setProgress(null)
    setError(null)
  }

  const setPlan = useCallback((p: Plan) => {
    stopProgress()
    setPlanState(p)
    setPhase('review')
    resetRun()
  }, [])

  const close = useCallback(() => {
    stopProgress()
    setPlanState(null)
    setPhase('idle')
    resetRun()
  }, [])

  const mutate = (fn: (o: PlanOp) => PlanOp) =>
    setPlanState((p) => (p ? { ...p, ops: p.ops.map(fn) } : p))

  /** Flip included; an op carrying an `issue` can NEVER be enabled. */
  const toggleOp = useCallback((id: string) => {
    mutate((o) => (o.id === id ? { ...o, included: o.issue ? false : !o.included } : o))
  }, [])

  const updateOp = useCallback((id: string, patch: PlanOpPatch) => {
    mutate((o) => {
      if (o.id !== id) return o
      let next: PlanOp = o
      let issue: string | null = null
      if (o.kind === 'createFolder' && patch.path !== undefined) {
        next = { ...o, path: patch.path }
        if (!patch.path.trim()) issue = 'empty path'
      } else if (o.kind === 'rename' && patch.newName !== undefined) {
        next = { ...o, newName: patch.newName }
        if (isBadName(patch.newName)) issue = 'invalid name'
      } else if (o.kind === 'move' && patch.destDir !== undefined) {
        next = { ...o, destDir: patch.destDir }
        if (!patch.destDir.trim()) issue = 'empty destination'
      }
      if (issue) return { ...next, issue, included: false }
      if (next.issue && LOCAL_ISSUES.has(next.issue)) {
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
    unsubRef.current = await onPlanProgress(setProgress)
    try {
      const r = await applyPlan(id, p.ops.filter((o) => o.included))
      setReport(r)
      setPhase('applied')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
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
    unsubRef.current = await onPlanProgress(setProgress)
    try {
      const r = await undoPlan(id)
      setUndoReport(r)
      setPhase('undone')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('applied')
    } finally {
      stopProgress()
      setProgress(null)
    }
  }, [])

  return { plan, phase, progress, report, undoReport, batchId, error, setPlan, close, toggleOp, updateOp, apply, undo }
}
