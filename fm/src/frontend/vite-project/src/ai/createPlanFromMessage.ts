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

export async function createPlanFromMessage(args: {
  text: string
  entries: FileEntry[]
  currentPath: string
  guardOn: boolean
  model: string
  health?: AiHealth
}): Promise<Plan> {
  const health = args.health ?? (await checkHealth())
  if (!health.ok) throw new Error(i18n.t('ai.providerUnreachable'))
  const listing = renderDirListing(args.entries, PLAN_MAX_ENTRIES)
  const shape = await generatePlan({ text: args.text, listing, model: args.model, health })
  return expandPlan(shape, { rootPath: args.currentPath, entries: args.entries, guardOn: args.guardOn })
}
