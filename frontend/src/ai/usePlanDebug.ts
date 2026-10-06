/**
 * Store/hook per i log di debug delle chiamate AI Magic (🪄 Crea piano).
 * Conserva la cronologia delle esecuzioni (ring buffer max 50 voci).
 * I log sono persistiti in localStorage (chiave `clive:planDebugLogs`)
 * così sopravvivono al riavvio dell'app e l'utente può ispezionarli nel
 * Debug Modal anche dopo un crash/riapertura.
 */
import { useState, useCallback } from 'react'
import type { ModelPlanShape } from './plan'

export type PlanDebugStatus = 'pending' | 'success' | 'empty' | 'error'
export type PlanDebugStage = 'health' | 'stream' | 'structured' | 'expand' | 'apply' | 'undo' | 'ui'

export interface PlanDebugEvent {
  at: number
  stage: PlanDebugStage
  type: 'start' | 'response' | 'success' | 'error' | 'state' | 'click'
  durationMs?: number
  detail?: string
  metadata?: Record<string, string | number | boolean | null>
}

export interface PlanDebugApply {
  status: 'pending' | 'success' | 'error'
  startedAt: number
  finishedAt?: number
  batchId?: string
  totalOps: number
  includedOps: number
  excludedOps: number
  opsByKind: Record<string, number>
  payload?: unknown
  progress?: { done: number; total: number; currentId: string }
  report?: unknown
  errorDetails?: string
}

export interface PlanDebugLog {
  id: string
  /** Origin of the run; the activity center uses this to group chat and plan work. */
  kind?: 'chat' | 'plan'
  timestamp: number
  model: string
  status: PlanDebugStatus
  stage?: PlanDebugStage
  promptText: string
  signature: string
  rawResponse?: ModelPlanShape
  expandedOpsCount?: number
  errorDetails?: string
  events?: PlanDebugEvent[]
  apply?: PlanDebugApply
}

const STORAGE_KEY = 'clive:planDebugLogs'
const MAX_LOGS = 50
const MAX_TEXT = 20_000

/** Keep diagnostics useful without persisting the user's account name or
 * credentials copied into an AI answer. Exact filesystem payloads remain
 * available only in the apply section, where they are needed to diagnose a
 * concrete operation. */
export function redactDebugText(value: string): string {
  return value
    .replace(/\/Users\/[^/\s]+/g, '~')
    .replace(/\/home\/[^/\s]+/g, '~')
    .replace(/((?:api[_-]?key|authorization|token|password)\s*[:=]\s*)([^\s,;]+)/gi, '$1[redacted]')
    .slice(0, MAX_TEXT)
}

function tryLoad(): PlanDebugLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as PlanDebugLog[]).slice(0, MAX_LOGS) : []
  } catch {
    return []
  }
}

let globalLogs: PlanDebugLog[] = tryLoad()
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(globalLogs.slice(0, MAX_LOGS)))
  } catch {
    /* storage full – best-effort */
  }
}

function notify() {
  listeners.forEach((cb) => cb())
}

export function addDebugLog(log: Omit<PlanDebugLog, 'timestamp'>): PlanDebugLog {
  const entry: PlanDebugLog = {
    ...log,
    promptText: redactDebugText(log.promptText),
    signature: redactDebugText(log.signature),
    errorDetails: log.errorDetails ? redactDebugText(log.errorDetails) : undefined,
    timestamp: Date.now(),
  }
  globalLogs = [entry, ...globalLogs].slice(0, MAX_LOGS)
  persist()
  notify()
  return entry
}

export function updateDebugLog(id: string, patch: Partial<PlanDebugLog>) {
  const safePatch = {
    ...patch,
    errorDetails: patch.errorDetails ? redactDebugText(patch.errorDetails) : patch.errorDetails,
  }
  globalLogs = globalLogs.map((item) => (item.id === id ? { ...item, ...safePatch } : item))
  persist()
  notify()
}

export function addDebugEvent(id: string, event: Omit<PlanDebugEvent, 'at'>) {
  globalLogs = globalLogs.map((item) => item.id === id
    ? { ...item, events: [...(item.events ?? []), { ...event, detail: event.detail ? redactDebugText(event.detail) : event.detail, at: Date.now() }].slice(-40) }
    : item)
  persist()
  notify()
}

export function clearDebugLogs() {
  globalLogs = []
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* noop */ }
  notify()
}

export function getDebugLogs(): PlanDebugLog[] {
  return globalLogs
}

export function getDebugLog(id: string): PlanDebugLog | undefined {
  return globalLogs.find((log) => log.id === id)
}

export function usePlanDebug() {
  const [, setTick] = useState(0)

  const subscribe = useCallback(() => {
    const listener = () => setTick((t) => t + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const logs = globalLogs

  return {
    logs,
    subscribe,
    clearLogs: clearDebugLogs,
  }
}
