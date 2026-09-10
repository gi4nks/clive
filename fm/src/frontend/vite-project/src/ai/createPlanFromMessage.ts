/**
 * App-side plan pipeline (Task 6, R8): chat message -> health probe ->
 * second model turn -> expandPlan against the real listing. Extracted from
 * App so the flow is unit-testable without rendering the whole app.
 */
import { checkHealth } from './runtime.js'
import type { AiHealth } from './runtime.js'
import { generatePlan } from './chat.js'
import { expandPlan } from './plan.js'
import type { Plan } from './plan.js'
import { renderPlanSignature } from './budget.js'
import type { FileEntry } from '../api.js'
import i18n from '../i18n'

/** R7 hard cap: above this the 🪄 button is disabled entirely. */
export const PLAN_MAX_ENTRIES = 5000
/** Cap the analysis text forwarded to the second turn (chars). */
export const PLAN_TEXT_CAP = 6000

export async function createPlanFromMessage(args: {
  text: string
  entries: FileEntry[]
  currentPath: string
  guardOn: boolean
  model: string
  health?: AiHealth
  signal?: AbortSignal
}): Promise<Plan> {
  const health = args.health ?? (await checkHealth())
  if (!health.ok) throw new Error(i18n.t('ai.providerUnreachable'))
  if (args.signal?.aborted) throw new Error('aborted')
  // Send a compact folder SIGNATURE (not the full listing): the model writes
  // rules it can't enumerate by name; the client applies them to the real
  // entries below. This keeps the planner call small and fast.
  const listing = renderPlanSignature(args.entries)
  const text = args.text.length > PLAN_TEXT_CAP ? args.text.slice(0, PLAN_TEXT_CAP) : args.text
  const shape = await generatePlan({ text, listing, model: args.model, health, signal: args.signal })
  return expandPlan(shape, { rootPath: args.currentPath, entries: args.entries, guardOn: args.guardOn })
}
