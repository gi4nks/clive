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
import { renderDirListing } from './budget.js'
import type { FileEntry } from '../api.js'
import i18n from '../i18n'

/** R7 hard cap: above this the 🪄 button is disabled entirely. */
export const PLAN_MAX_ENTRIES = 5000
/** Cap how much of the folder listing we send for planning. The second model
 *  turn is a single non-streamed call; a huge listing (thousands of names) plus
 *  a long analysis makes it take minutes. We still expandPlan against the FULL
 *  entries so any basename the model echoes resolves correctly. */
export const PLAN_LISTING_CAP = 1200
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
  const listing = renderDirListing(args.entries, PLAN_LISTING_CAP)
  const text = args.text.length > PLAN_TEXT_CAP ? args.text.slice(0, PLAN_TEXT_CAP) : args.text
  const shape = await generatePlan({ text, listing, model: args.model, health, signal: args.signal })
  return expandPlan(shape, { rootPath: args.currentPath, entries: args.entries, guardOn: args.guardOn })
}
