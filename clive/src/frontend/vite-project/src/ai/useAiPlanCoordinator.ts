import { usePlan } from './usePlan.js'
import { usePlanGeneration } from './usePlanGeneration.js'
import type { FileEntry } from '../api.js'

/** Coordinates the AI Plan workflow at one seam. App supplies the current
 * listing/configuration and receives a stable workflow surface; lifecycle,
 * cancellation and review/apply state remain local to this module. */
export function useAiPlanCoordinator(args: {
  entries: FileEntry[]
  currentPath: string
  guardOn: boolean
  model: string
}) {
  const plan = usePlan()
  const generation = usePlanGeneration({ ...args, setPlan: plan.setPlan })
  return {
    plan,
    generation,
    createPlan: generation.start,
    cancelCreatePlan: generation.cancel,
    planBusy: generation.busy,
    planNotice: generation.notice,
    planElapsed: generation.elapsed,
    canPlan: generation.canPlan,
  }
}
