/**
 * App-side plan pipeline (Task 6, R8): chat message -> health probe ->
 * second model turn -> expandPlan against the real listing. Extracted from
 * App so the flow is unit-testable without rendering the whole app.
 *
 * Robustness: the plain streaming turn is the primary planner path because
 * OpenAI-compatible upstreams do not consistently support json_schema. The
 * structured turn remains a bounded fallback for providers that support it.
 */
import { checkHealth } from "./runtime.js"
import type { AiHealth } from "./runtime.js"
import { generatePlan, streamPlan } from "./chat.js"
import { expandPlan } from "./plan.js"
import type { Plan } from "./plan.js"
import { renderPlanSignature } from "./budget.js"
import type { FileEntry } from "../api.js"
import i18n from "../i18n"
import { addDebugEvent, addDebugLog, updateDebugLog } from "./usePlanDebug.js"
import { AiExecutionError, describeAiError } from './execution.js'

/** R7 hard cap: above this the 🪄 button is disabled entirely. */
export const PLAN_MAX_ENTRIES = 5000
/** Cap the analysis text forwarded to the second turn (chars). */
export const PLAN_TEXT_CAP = 6000
/** OpenCode can spend well over a minute before/while producing a plan,
 * especially with reasoning models. Keep this bounded, but do not abort a
 * healthy slow stream before it has a chance to complete. */
export const PLAN_MODEL_TIMEOUT_MS = 240_000
/** One wall-clock budget for the complete planner pipeline. */
export const PLAN_TOTAL_TIMEOUT_MS = 300_000

/** Remove terminal control sequences that can leak into copied AI output.
 * OSC colour sequences are particularly harmful here: they are invisible in
 * chat but become literal `]4;...rgb...` fragments in the planner prompt. */
export function sanitizePlannerText(value: string): string {
  return value
    .replace(/\u001b\][\s\S]*?(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\]4;\d+;rgb:[0-9a-f/]+\\?/gi, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
}

export async function createPlanFromMessage(args: {
  text: string
  entries: FileEntry[]
  currentPath: string
  guardOn: boolean
  model: string
  health?: AiHealth
  signal?: AbortSignal
  /** Injectable for tests; production uses the real generatePlan. */
  generate?: typeof generatePlan
  /** Injectable for tests; production uses the real streamPlan. */
  streamGenerate?: typeof streamPlan
}): Promise<Plan> {
  const logId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const cleanText = sanitizePlannerText(args.text)
  const text = cleanText.length > PLAN_TEXT_CAP ? cleanText.slice(0, PLAN_TEXT_CAP) : cleanText
  const listing = renderPlanSignature(args.entries)
  const abortable = args.signal?.aborted === true
  const deadline = Date.now() + PLAN_TOTAL_TIMEOUT_MS

  addDebugLog({
    id: logId,
    kind: 'plan',
    model: args.model,
    status: "pending",
    stage: "health",
    promptText: text,
    signature: listing,
  })

  const streamFirst = async (): Promise<Plan> => {
    const started = Date.now()
    addDebugEvent(logId, { stage: 'stream', type: 'start' })
    updateDebugLog(logId, { status: "pending", stage: "stream", errorDetails: undefined })
    const stream = args.streamGenerate ?? streamPlan
    const remaining = Math.min(PLAN_MODEL_TIMEOUT_MS, deadline - Date.now())
    if (remaining <= 0) throw new AiExecutionError('timeout', 'AI generation timed out')
    const raw = await stream({ text, listing, model: args.model, health: args.health ?? { ok: true, providers: {} }, signal: args.signal, timeoutMs: remaining, onResponse: (meta) => {
      addDebugEvent(logId, { stage: 'stream', type: 'response', durationMs: Date.now() - started, metadata: { status: meta.status ?? null, ...(meta.headers?.['x-clive-request-id'] ? { requestId: meta.headers['x-clive-request-id'] } : {}) } })
    } })
    updateDebugLog(logId, { stage: "expand" })
    const p = expandPlan(raw, { rootPath: args.currentPath, entries: args.entries, guardOn: args.guardOn })
    updateDebugLog(logId, {
      rawResponse: raw,
      expandedOpsCount: p.ops.length,
      status: p.ops.length ? "success" : "empty",
      errorDetails: p.ops.length ? undefined : 'Empty plan from streaming planner',
    })
    addDebugEvent(logId, { stage: 'stream', type: 'success', durationMs: Date.now() - started })
    return { ...p, debugId: logId }
  }

  try {
    updateDebugLog(logId, { stage: "health" })
    const health = args.health ?? (await checkHealth(args.signal, args.model))
    if (!health.ok || (health.selected && (!health.selected.providerOk || !health.selected.modelAvailable))) {
      const err = i18n.t("ai.providerUnreachable")
      updateDebugLog(logId, { status: "error", errorDetails: err })
      throw new Error(err)
    }
    if (abortable) {
      updateDebugLog(logId, { status: "error", errorDetails: "aborted" })
      throw new Error("aborted")
    }

    const ctx = { rootPath: args.currentPath, entries: args.entries, guardOn: args.guardOn }
    // The plain streaming path is the same path already used successfully by
    // chat. It avoids the provider-dependent response_format=json_schema
    // request emitted by generateObject().
    try {
      const p = await streamFirst()
      if (p.ops.length || args.signal?.aborted) return { ...p, debugId: logId }
    } catch (streamErr) {
      if (args.signal?.aborted || String(streamErr).includes('abort')) throw streamErr
      updateDebugLog(logId, { errorDetails: `stream failed: ${describeAiError(streamErr)}` })
      addDebugEvent(logId, { stage: 'stream', type: 'error', detail: describeAiError(streamErr) })
    }

    if (args.signal?.aborted) throw new Error('aborted')
    const healthForStructured = health
    const generate = args.generate ?? generatePlan
    const remaining = Math.min(PLAN_MODEL_TIMEOUT_MS, deadline - Date.now())
    if (remaining <= 0) throw new AiExecutionError('timeout', 'AI generation timed out')
    updateDebugLog(logId, { stage: "structured", errorDetails: undefined })
    const base = { text, listing, model: args.model, health: healthForStructured, signal: args.signal, timeoutMs: remaining }
    const structuredStarted = Date.now()
    addDebugEvent(logId, { stage: 'structured', type: 'start' })
    const rawPlan = await generate({ ...base, onResponse: (meta) => {
      addDebugEvent(logId, { stage: 'structured', type: 'response', durationMs: Date.now() - structuredStarted, metadata: { status: meta.status ?? null, ...(meta.headers?.['x-clive-request-id'] ? { requestId: meta.headers['x-clive-request-id'] } : {}) } })
    } })
    updateDebugLog(logId, { stage: "expand" })
    let plan = expandPlan(rawPlan, ctx)
    const retryRemaining = Math.min(PLAN_MODEL_TIMEOUT_MS, deadline - Date.now())
    if (!plan.ops.length && !args.signal?.aborted && retryRemaining > 0) {
      updateDebugLog(logId, { stage: "structured" })
      plan = expandPlan(await generate({ ...base, retry: true, timeoutMs: retryRemaining }), ctx)
    }
    updateDebugLog(logId, {
      rawResponse: rawPlan,
      expandedOpsCount: plan.ops.length,
      status: plan.ops.length ? 'success' : 'empty',
    })
    addDebugEvent(logId, { stage: 'structured', type: 'success', durationMs: Date.now() - structuredStarted })
    return { ...plan, debugId: logId }
  } catch (err) {
    updateDebugLog(logId, { status: 'error', errorDetails: describeAiError(err) })
    throw err
  }
}
