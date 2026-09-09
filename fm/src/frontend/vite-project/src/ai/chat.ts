/**
 * Chat AI pure layer (v1). Types, action-marker parsing, action validation,
 * prompt assembly, history trimming. No React, no I/O — everything here is
 * unit-testable without mocking.
 */

import { validateNewName } from './safety.js'
import { isProtectedPath } from '../systemGuard.js'

export const ACTIONS_OPEN = '<<<ACTIONS>>>'
export const ACTIONS_CLOSE = '<<<END>>>'

/** Stable sentinel stored in `actionErrors` when the user cancels an action card. */
export const CANCELLED_SENTINEL = 'chat-cancelled'

export type ChatActionType = 'rename' | 'organize' | 'create' | 'trash'

export interface RenameAction { type: 'rename'; file: string; newName: string }
export interface OrganizeAction { type: 'organize'; file: string; dstFolder: string }
export interface CreateAction { type: 'create'; file: string; content: string }
export interface TrashAction { type: 'trash'; file: string }

export type ChatAction = RenameAction | OrganizeAction | CreateAction | TrashAction

export interface ParsedActions { text: string; actions: ChatAction[] }

const ACTION_TYPES = new Set<ChatActionType>(['rename', 'organize', 'create', 'trash'])

function isActionType(v: unknown): v is ChatActionType {
  return typeof v === 'string' && ACTION_TYPES.has(v as ChatActionType)
}

function isValidAction(a: unknown): a is ChatAction {
  if (typeof a !== 'object' || a === null) return false
  const obj = a as Record<string, unknown>
  if (!isActionType(obj.type)) return false
  switch (obj.type) {
    case 'rename':
      return typeof obj.file === 'string' && typeof obj.newName === 'string'
    case 'organize':
      return typeof obj.file === 'string' && typeof obj.dstFolder === 'string'
    case 'create':
      return typeof obj.file === 'string' && typeof obj.content === 'string'
    case 'trash':
      return typeof obj.file === 'string'
  }
}

/**
 * Given a raw assistant message, split it into visible text and validated actions.
 * Tolerant: unknown types are dropped, malformed JSON leaves the block in `text`.
 */
export function extractActions(raw: string): ParsedActions {
  const re = /<<<ACTIONS>>>([\s\S]*?)<<<END>>>/i
  const m = re.exec(raw)
  if (!m) return { text: raw, actions: [] }
  try {
    const parsed = JSON.parse(m[1].trim()) as unknown
    if (typeof parsed !== 'object' || parsed === null) return { text: raw, actions: [] }
    const arr = (parsed as { actions?: unknown }).actions
    if (!Array.isArray(arr)) return { text: raw, actions: [] }
    const actions = arr.filter(isValidAction)
    const text = raw.slice(0, m.index) + raw.slice(m.index + m[0].length)
    return { text: text.trimEnd(), actions }
  } catch {
    return { text: raw, actions: [] }
  }
}

export type ValidatedAction = { ok: true; action: ChatAction } | { ok: false; error: string }

export interface ValidateCtx {
  currentDir: string
  existingNames: string[]
  guardOn: boolean
}

function parentOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i > 0 ? path.slice(0, i) : '/'
}

function guardBlocks(path: string, ctx: ValidateCtx): string | null {
  if (!ctx.guardOn) return null
  if (isProtectedPath(path)) return 'system location (guard on)'
  return null
}

export function validateChatAction(a: ChatAction, ctx: ValidateCtx): ValidatedAction {
  switch (a.type) {
    case 'rename': {
      const blocked = guardBlocks(a.file, ctx)
      if (blocked) return { ok: false, error: blocked }
      const chk = validateNewName(a.newName)
      if (!chk.ok) return { ok: false, error: chk.reason ?? 'invalid name' }
      if (ctx.existingNames.includes(chk.name!)) return { ok: false, error: 'name already exists' }
      return { ok: true, action: { ...a, newName: chk.name! } }
    }
    case 'organize': {
      const srcBlocked = guardBlocks(a.file, ctx)
      if (srcBlocked) return { ok: false, error: srcBlocked }
      const chk = validateNewName(a.dstFolder)
      if (!chk.ok) return { ok: false, error: chk.reason ?? 'invalid folder' }
      const dst = `${ctx.currentDir}/${chk.name}`
      const dstBlocked = guardBlocks(dst, ctx)
      if (dstBlocked) return { ok: false, error: dstBlocked }
      return { ok: true, action: { ...a, dstFolder: chk.name! } }
    }
    case 'create': {
      if (parentOf(a.file) !== ctx.currentDir) return { ok: false, error: 'target outside current dir' }
      const name = a.file.slice(a.file.lastIndexOf('/') + 1)
      const chk = validateNewName(name)
      if (!chk.ok) return { ok: false, error: chk.reason ?? 'invalid name' }
      if (ctx.existingNames.includes(chk.name!)) return { ok: false, error: 'file already exists' }
      const blocked = guardBlocks(a.file, ctx)
      if (blocked) return { ok: false, error: blocked }
      return { ok: true, action: { ...a, file: `${ctx.currentDir}/${chk.name}` } }
    }
    case 'trash': {
      const blocked = guardBlocks(a.file, ctx)
      if (blocked) return { ok: false, error: blocked }
      return { ok: true, action: a }
    }
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  actions?: ChatAction[]
}

export const MAX_HISTORY_CHARS = 12_000

export const CHAT_SYSTEM_PROMPT = [
  'You are the AI assistant of Clive, a file manager.',
  'Answer in the language the user writes in.',
  'If the user asks you to perform a file operation (rename, move, create, trash),',
  'propose it at the END of your reply using ONLY this exact format:',
  '',
  ACTIONS_OPEN,
  '{"actions":[{"type":"rename","file":"/abs/path","newName":"b.txt"}]}',
  ACTIONS_CLOSE,
  '',
  'Allowed types: rename (file,newName), organize (file,dstFolder), create (file,content), trash (file).',
  'Nessuna azione viene eseguita senza conferma esplicita dell\'utente.',
  'If the user does not ask for an operation, do not emit the block.',
].join('\n')

export function trimHistory(history: ChatMessage[], maxChars: number = MAX_HISTORY_CHARS): { kept: ChatMessage[]; truncated: boolean } {
  const size = (arr: ChatMessage[]) => arr.reduce((s, m) => s + m.content.length + 20, 0)
  if (size(history) <= maxChars) return { kept: history, truncated: false }

  const first = history[0]
  const rest = history.slice(1)
  const keptRest: ChatMessage[] = []
  let budget = maxChars - (first ? first.content.length + 20 : 0)
  // Walk from the END and accumulate; then reverse.
  for (let i = rest.length - 1; i >= 0; i--) {
    const m = rest[i]
    if (m.content.length + 20 > budget) break
    keptRest.unshift(m)
    budget -= m.content.length + 20
  }
  const kept = first ? [first, ...keptRest] : keptRest
  return { kept, truncated: kept.length < history.length }
}

export interface ChatPromptCtx {
  currentDir: string
  dirListing: string
  fileContext: string
}

export function buildChatPrompt(ctx: ChatPromptCtx, history: ChatMessage[], userMsg: string): { system: string; prompt: string; truncated: boolean } {
  const { kept, truncated } = trimHistory(history)
  const parts: string[] = [
    `Current directory: ${ctx.currentDir}`,
    ctx.dirListing ? `\nDirectory contents:\n${ctx.dirListing}` : '',
    ctx.fileContext ? `\nSelected/attached file contents:\n${ctx.fileContext}` : '',
    '',
    'Conversation so far:',
    ...kept.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`),
    `User: ${userMsg}`,
    '',
    'Assistant:',
  ]
  return { system: CHAT_SYSTEM_PROMPT, prompt: parts.filter(Boolean).join('\n'), truncated }
}

// ---------------------------------------------------------------------------
// Plan generation (AI Plan task 2): second model turn -> ModelPlanShape.
// ---------------------------------------------------------------------------
import { z } from 'zod'
import i18n from '../i18n'
import { generateStructured, type AiHealth } from './runtime.js'
import type { ModelPlanShape } from './plan.js'

/** Wire schema for the plan turn; arrays default to [] so downstream never crashes. */
export const ModelPlanShapeSchema = z.object({
  folders: z.array(z.string()).default([]),
  assignments: z.array(z.object({ file: z.string(), to: z.string() })).default([]),
  renames: z.array(z.object({ file: z.string(), to: z.string() })).default([]),
  trash: z.array(z.object({ file: z.string() })).default([]),
  notes: z.string().optional(),
})

export interface PlanDeps {
  model: string
  health: AiHealth
  signal?: AbortSignal
  /** Injected so tests can fake the model; production passes generateStructured. */
  callModel?: typeof generateStructured
}

const PLAN_SYSTEM_PROMPT =
  'You are a file-organization planner for a dual-pane file manager. ' +
  'Return ONLY a json object with keys folders[], assignments[{file,to}], renames[{file,to}], trash[{file}]. ' +
  '`file` must be a basename present in the listing. `to` is a relative folder path using `/`. ' +
  'Do not invent names. Do not modify existing folders beyond creating the listed new subfolders.'

/**
 * Turn a chat reorganization analysis into a structured plan with ONE model
 * call. Ruling R2: the word "json" must appear in BOTH system and user
 * prompts (gateway providers reject response_format json_object otherwise).
 */
export async function generatePlan(
  args: { text: string; listing: string } & PlanDeps,
): Promise<ModelPlanShape> {
  if (!args.health.ok) throw new Error(i18n.t('ai.providerUnreachable'))
  const prompt =
    'Assistant analysis:\n' + args.text + '\n\n' +
    'Directory listing:\n' + args.listing + '\n\n' +
    'Produce the json plan now.'
  const call = args.callModel ?? generateStructured
  const out = (await call({
    model: args.model,
    schema: ModelPlanShapeSchema,
    system: PLAN_SYSTEM_PROMPT,
    prompt,
    signal: args.signal,
  })) as Partial<ModelPlanShape>
  return {
    folders: out.folders ?? [],
    assignments: out.assignments ?? [],
    renames: out.renames ?? [],
    trash: out.trash ?? [],
    notes: out.notes,
  }
}
