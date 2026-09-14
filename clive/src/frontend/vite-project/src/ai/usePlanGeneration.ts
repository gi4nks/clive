import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileEntry } from '../api.js'
import { createPlanFromMessage, PLAN_MAX_ENTRIES } from './createPlanFromMessage.js'
import type { Plan } from './plan.js'
import i18n from '../i18n'
import { describeAiError } from './execution.js'
import { addDebugEvent } from './usePlanDebug.js'

interface PlanGenerationArgs {
  entries: FileEntry[]
  currentPath: string
  guardOn: boolean
  model: string
  setPlan: (plan: Plan) => void
}

/** Deep application module for the AI Plan lifecycle. App only supplies the
 * current pane snapshot and receives a plan; timeout, cancellation, notice
 * and elapsed-time policy stay behind this seam. */
export function usePlanGeneration(args: PlanGenerationArgs) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'empty' | 'error'; message: string } | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!busy) {
      setElapsed(0)
      return
    }
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [busy])

  useEffect(() => () => abortRef.current?.abort(), [])

  const start = useCallback(async (text: string) => {
    if (busy || args.entries.length > PLAN_MAX_ENTRIES) return
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setNotice(null)
    try {
      const plan = await createPlanFromMessage({
        text,
        entries: args.entries,
        currentPath: args.currentPath,
        guardOn: args.guardOn,
        model: args.model,
        signal: controller.signal,
      })
      if (controller.signal.aborted) throw new Error('aborted')
      if (!plan.ops.length) {
        setNotice({ kind: 'empty', message: i18n.t('plan.empty') })
        return
      }
      args.setPlan(plan)
      if (plan.debugId) addDebugEvent(plan.debugId, { stage: 'expand', type: 'success', metadata: { planReady: true, ops: plan.ops.length } })
    } catch (error) {
      const aborted = controller.signal.aborted || String(error).includes('abort')
      setNotice({ kind: 'error', message: aborted ? i18n.t('plan.timeout') : describeAiError(error) })
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setBusy(false)
    }
  }, [args, busy])

  const cancel = useCallback(() => abortRef.current?.abort(), [])
  const dismissNotice = useCallback(() => setNotice(null), [])

  return { busy, notice, elapsed, start, cancel, dismissNotice, canPlan: args.entries.length <= PLAN_MAX_ENTRIES }
}
