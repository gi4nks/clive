/**
 * Persistence for the restart-undo affordance (R11): the id of the last
 * successfully applied plan batch. Malformed or batchId-less payloads are
 * dropped on read so the App banner can never render a dead entry.
 */

const KEY = 'clive.plan.lastBatch'

export interface LastBatchRecord {
  batchId: string
  rootPath: string | null
  createdAt: number
}

export function writeLastBatch(rec: LastBatchRecord): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(rec))
  } catch {
    /* storage full/unavailable — undo banner is best-effort */
  }
}

/** Returns the stored batchId, or null (clearing the key if unreadable). */
export function readLastBatch(): string | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return null
  }
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw) as { batchId?: unknown }
    if (typeof parsed.batchId === 'string') return parsed.batchId
  } catch {
    /* malformed */
  }
  clearLastBatch()
  return null
}

export function clearLastBatch(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
