/**
 * Chat AI pure layer (v1). Types, action-marker parsing, action validation,
 * prompt assembly, history trimming. No React, no I/O — everything here is
 * unit-testable without mocking.
 */

import { validateNewName } from './safety.js'
import { isProtectedPath } from '../systemGuard.js'
import { validateFolderPath } from './plan.js'
import type { FileEntry } from '../api.js'

export const ACTIONS_OPEN = '<<<ACTIONS>>>'
export const ACTIONS_CLOSE = '<<<END>>>'

/** Stable sentinel stored in `actionErrors` when the user cancels an action card. */
export const CANCELLED_SENTINEL = 'chat-cancelled'

export type ChatActionType = 'rename' | 'organize' | 'createFolder' | 'create' | 'trash'

export interface RenameAction { type: 'rename'; file: string; newName: string }
export interface OrganizeAction { type: 'organize'; file: string; dstFolder: string }
export interface CreateFolderAction { type: 'createFolder'; folder: string }
export interface CreateAction { type: 'create'; file: string; content: string }
export interface TrashAction { type: 'trash'; file: string }

export type ChatAction = RenameAction | OrganizeAction | CreateFolderAction | CreateAction | TrashAction

export interface ParsedActions { text: string; actions: ChatAction[] }

const ACTION_TYPES = new Set<ChatActionType>(['rename', 'organize', 'createFolder', 'create', 'trash'])

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
    case 'createFolder':
      return typeof obj.folder === 'string'
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
  entries?: Pick<FileEntry, 'name' | 'path'>[]
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
    case 'createFolder': {
      const v = validateFolderPath(a.folder)
      if (!v.ok) return { ok: false, error: v.reason ?? 'invalid folder' }
      const absPath = `${ctx.currentDir.replace(/\/+$/, '')}/${a.folder.replace(/\/+$/, '')}`
      const blocked = guardBlocks(absPath, ctx)
      if (blocked) return { ok: false, error: blocked }
      const firstSeg = a.folder.split('/').filter(Boolean)[0]
      if (ctx.entries) {
        if (ctx.entries.some((e) => e.path === absPath)) return { ok: false, error: 'target exists' }
      } else if (firstSeg && ctx.existingNames.includes(firstSeg)) {
        return { ok: false, error: 'target exists' }
      }
      return { ok: true, action: { ...a, folder: a.folder.replace(/\/+$/, '') } }
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
  'Allowed types: rename (file,newName), organize (file,dstFolder), createFolder (folder), create (file,content), trash (file).',
  'Rules for actions:',
  '- create: a SINGLE new text file whose parent folder is EXACTLY the current directory (no subpaths, no placeholders).',
  '- createFolder: create a new empty folder; `folder` may be a nested RELATIVE path like "01_Personal/CV".',
  '- organize: moves one file into a single one-level subfolder (dstFolder has no "/").',
  '- Never create empty ".keep" files to fake folder creation — use createFolder instead.',
  'For reorganizations that build a folder tree or move MANY files, do NOT emit inline actions:',
  'explain the plan in words and tell the user to press the magic button (🪄 "Crea piano") to turn it into an executable, undoable plan.',
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
import { generateStructured, streamChat, type AiHealth, type AiResponseMeta } from './runtime.js'
import type { StreamArgs } from './runtime.js'
import type { ModelPlanShape } from './plan.js'

/** Wire schema for the plan turn; arrays default to [] so downstream never crashes. */
export const ModelPlanShapeSchema = z.object({
  folders: z.array(z.string()).default([]),
  rules: z.array(z.object({ match: z.string(), to: z.string() })).default([]),
  // Backward-compatible names used by the original plan spec and by some
  // models that follow the prose contract instead of the compact rule one.
  assignments: z.array(z.object({ file: z.string(), to: z.string() })).default([]),
  renames: z.array(z.object({ file: z.string(), to: z.string() })).default([]),
  trashPatterns: z.array(z.string()).default([]),
  trash: z.array(z.object({ file: z.string() })).default([]),
  fallback: z.string().optional(),
  notes: z.string().optional(),
})

export interface PlanDeps {
  model: string
  health: AiHealth
  signal?: AbortSignal
  /** Injected so tests can fake the model; production passes generateStructured. */
  callModel?: typeof generateStructured
  /** Second attempt after the first produced an empty (unusable) plan. */
  retry?: boolean
  timeoutMs?: number
  onResponse?: (meta: AiResponseMeta) => void
}

const PLAN_SYSTEM_PROMPT =
  'You are a file-organization planner for a dual-pane file manager. ' +
  'Return ONLY a json object with keys: folders[] (relative paths using "/"), ' +
  'rules[{match,to}] where `match` is a case-insensitive SUBSTRING of a filename (or an extension like ".pdf") and `to` is a relative destination folder, ' +
  'renames[{file,to}] only for specific files you must rename (rare), ' +
  'trashPatterns[] of filename substrings/extensions to send to the Trash, and an optional fallback (folder for unmatched files). ' +
  'IMPORTANT: do NOT list individual files. Express the organization as AT MOST ~40 rules that the app applies to the real listing. ' +
  'The first matching rule wins; trashPatterns take priority. Do not invent folder names that require modifying existing folders. ' +
  'An empty plan is a failure: if any file kind would remain unmatched, emit a fallback so every file has a destination.'

/** Retry prompt: the first attempt produced an empty plan, which aborts the
 * pipeline — we force a concrete, covering plan instead of accepting silence. */
const PLAN_SYSTEM_PROMPT_RETRY =
  'You are a file-organization planner. Your previous answer was REJECTED because it produced an EMPTY plan. ' +
  'Return ONLY a json object with keys: folders[] (relative paths using "/"), ' +
  'rules[{match,to}] where `match` is a case-insensitive SUBSTRING of a filename (or an extension like ".pdf") and `to` is a relative destination folder, ' +
  'renames[{file,to}] only for specific files you must rename (rare), ' +
  'trashPatterns[] of filename substrings/extensions to send to the Trash, and a REQUIRED fallback (folder for files not matched by any rule). ' +
  'The plan MUST cover every distinct file kind in the listing: emit at least one rule per kind, plus the fallback. Do not ask questions, do not leave arrays empty.'

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
    system: args.retry ? PLAN_SYSTEM_PROMPT_RETRY : PLAN_SYSTEM_PROMPT,
    prompt,
    signal: args.signal,
    timeoutMs: args.timeoutMs,
    onResponse: args.onResponse,
  })) as Partial<ModelPlanShape>
  const assignments = (out as Partial<ModelPlanShape> & {
    assignments?: { file: string; to: string }[]
  }).assignments ?? []
  const trash = (out as Partial<ModelPlanShape> & {
    trash?: { file: string }[]
  }).trash ?? []
  return {
    folders: out.folders ?? [],
    // Exact assignments are represented as rules for the shared expansion
    // layer. The matcher is made exact below by using a distinct prefix.
    rules: [
      ...assignments.map((a) => ({ match: `__exact__${a.file}`, to: a.to })),
      ...(out.rules ?? []),
    ],
    renames: out.renames ?? [],
    trashPatterns: [...(out.trashPatterns ?? []), ...trash.map((a) => `__exact__${a.file}`)],
    fallback: out.fallback,
    notes: out.notes,
  }
}

// ---------------------------------------------------------------------------
// Streaming plan fallback.
//
// The structured (json_schema) turn above is flaky on some upstreams: it can
// hang for minutes or return an EMPTY shape. The plain streaming chat path —
// the one the first (analysis) turn already uses and provably works — is a
// reliable fallback: ask for a delimited JSON block and parse it here.
// ---------------------------------------------------------------------------

export const PLAN_OPEN = '<<<PLAN>>>'
export const PLAN_CLOSE = '<<<END>>>'

/** Extract the JSON inside `<<<PLAN>>> … <<<END>>>`; tolerant to absent
 * delimiters (falls back to first `{` … last `}`). Returns null when left
 * unchanged by the parser. */
export function extractPlanBlock(raw: string): unknown | null {
  const open = raw.indexOf(PLAN_OPEN)
  const close = raw.indexOf(PLAN_CLOSE, open > -1 ? open : 0)
  const slice =
    open > -1 && close > open ? raw.slice(open + PLAN_OPEN.length, close).trim() : ''
  const candidate = slice || (() => {
    const a = raw.indexOf('{')
    const b = raw.lastIndexOf('}')
    return a > -1 && b > a ? raw.slice(a, b + 1) : ''
  })()
  if (!candidate) return null
  try {
    const parsed = JSON.parse(candidate)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** Coerce an arbitrary parsed object into a valid ModelPlanShape, dropping
 * malformed rules (which would make expandPlan throw). */
export function normalizePlanShape(raw: unknown): ModelPlanShape {
  const obj = (raw ?? {}) as Record<string, unknown>
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  const rules = Array.isArray(obj.rules)
    ? obj.rules.filter(
        (r): r is { match: string; to: string } =>
          !!r && typeof r === 'object' && typeof (r as Record<string, unknown>).match === 'string' && typeof (r as Record<string, unknown>).to === 'string',
      )
    : []
  const assignments = Array.isArray(obj.assignments)
    ? obj.assignments.filter(
        (r): r is { file: string; to: string } =>
          !!r && typeof r === 'object' && typeof (r as Record<string, unknown>).file === 'string' && typeof (r as Record<string, unknown>).to === 'string',
      )
    : []
  const trash = Array.isArray(obj.trash)
    ? obj.trash.filter(
        (r): r is { file: string } => !!r && typeof r === 'object' && typeof (r as Record<string, unknown>).file === 'string',
      )
    : []
  return {
    folders: strArr(obj.folders),
    rules: [...assignments.map((a) => ({ match: `__exact__${a.file}`, to: a.to })), ...rules],
    renames: Array.isArray(obj.renames)
      ? obj.renames.filter(
          (r): r is { file: string; to: string } =>
            !!r && typeof r === 'object' && typeof (r as Record<string, unknown>).file === 'string' && typeof (r as Record<string, unknown>).to === 'string',
        )
      : [],
    trashPatterns: [...strArr(obj.trashPatterns), ...trash.map((a) => `__exact__${a.file}`)],
    fallback: typeof obj.fallback === 'string' ? obj.fallback : undefined,
    notes: typeof obj.notes === 'string' ? obj.notes : undefined,
  }
}

const PLAN_STREAM_PROMPT =
  'You are a file-organization planner. ' +
  'The previous structured call failed, so reply IN PLAIN TEXT. ' +
  'Emit your full answer between the delimiters ' + PLAN_OPEN + ' and ' + PLAN_CLOSE +
  ', containing ONLY a json object with keys: folders[] (relative paths using "/"), ' +
  'rules[{match,to}] where `match` is a case-insensitive SUBSTRING of a filename (or an extension like ".pdf") and `to` is a relative destination folder, ' +
  'renames[{file,to}] (rare), trashPatterns[] and a REQUIRED fallback folder. ' +
  'Emit at least one rule per distinct file kind in the listing; never an empty plan.'

/** Streaming fallback: plain chat (no structured output) producing a delimited
 * JSON block, parsed into a ModelPlanShape. Inject `callStream` in tests. */
export async function streamPlan(
  args: { text: string; listing: string } & PlanDeps & { callStream?: typeof streamChat },
): Promise<ModelPlanShape> {
  if (!args.health.ok) throw new Error(i18n.t('ai.providerUnreachable'))
  const stream: StreamArgs = {
    model: args.model,
    system: PLAN_STREAM_PROMPT,
    prompt:
      'Assistant analysis:\n' + args.text + '\n\n' +
      'Directory listing:\n' + args.listing + '\n\n' +
      'json plan:',
    signal: args.signal,
    timeoutMs: args.timeoutMs,
    maxOutputTokens: 1200,
    onResponse: args.onResponse,
  }
  const gen = args.callStream ?? streamChat
  let raw = ''
  for await (const chunk of gen(stream)) raw += chunk
  const parsed = extractPlanBlock(raw)
  const plan = normalizePlanShape(parsed)
  if (!plan.folders.length && !plan.rules.length && !plan.renames.length && !plan.trashPatterns.length && !plan.fallback) {
    throw new Error(i18n.t('plan.unparseable'))
  }
  return plan
}
