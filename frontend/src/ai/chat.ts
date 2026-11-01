/**
 * Chat AI pure layer (v1). Types, action-marker parsing, action validation,
 * prompt assembly, history trimming. No React, no I/O — everything here is
 * unit-testable without mocking.
 */

import type { ModelMessage } from 'ai'
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
  'You are Clive, a file manager assistant. Reply in the user\'s language.',
  'Use the current directory, directory listing, and attached file context supplied below. Do not ask the user to list files that are already shown. If the listing is shortened or missing, say what you could not inspect.',
  'Never change files without explicit user confirmation.',
  'For a single requested file operation, put this exact block at the end:',
  ACTIONS_OPEN,
  '{"actions":[{"type":"rename","file":"/abs/path","newName":"b.txt"}]}',
  ACTIONS_CLOSE,
  'Action types: rename(file,newName), organize(file,dstFolder), createFolder(folder), create(file,content), trash(file). create is one new text file in the current directory; createFolder accepts a relative nested path; organize moves one file to one direct subfolder.',
  'For a reorganization involving multiple files or folders, give a concrete plan based on the supplied filenames and tell the user to press 🪄 Create plan. Do not emit bulk actions in the block.',
  'Do not emit an action block unless the user requested an operation.',
].join('\n')

export function trimHistory(history: ChatMessage[], maxChars: number = MAX_HISTORY_CHARS): { kept: ChatMessage[]; truncated: boolean } {
  const size = (arr: ChatMessage[]) => arr.reduce((s, m) => s + m.content.length + 20, 0)
  if (size(history) <= maxChars) return { kept: history, truncated: false }

  const first = history[0]
  const rest = history.slice(1)
  const keptRest: ChatMessage[] = []
  let budget = maxChars - (first ? 20 : 0)
  if (first && first.content.length > budget) {
    return {
      kept: budget > 0 ? [{ ...first, content: first.content.slice(0, budget) }] : [],
      truncated: true,
    }
  }
  if (first) budget -= first.content.length
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

export interface ChatImageAttachment {
  name: string
  base64: string
  mimeType: string
}

export interface ChatPromptCtx {
  currentDir: string
  dirListing: string
  fileContext: string
  images?: ChatImageAttachment[]
}

function truncateListing(listing: string, maxChars: number): string {
  if (listing.length <= maxChars) return listing
  if (maxChars < 32) return ''
  const lines = listing.split('\n')
  const kept: string[] = []
  let used = 0
  for (const line of lines) {
    const cost = line.length + (kept.length ? 1 : 0)
    if (used + cost + 24 > maxChars) break
    kept.push(line)
    used += cost
  }
  const omitted = Math.max(1, lines.length - kept.length)
  return `${kept.join('\n')}\n… (+${omitted} omitted)`
}

export function buildChatPrompt(
  ctx: ChatPromptCtx,
  history: ChatMessage[],
  userMsg: string,
  contextLength?: number,
): {
  system: string
  prompt: string
  messages: ModelMessage[]
  truncated: boolean
  maxOutputTokens?: number
} {
  // Keep input and output inside the selected model's actual context window.
  // Small context models (<= 4096) get an explicit output cap so input + output
  // never exceed max_model_len; larger models reserve headroom for budgeting
  // without artificially starving reasoning/output tokens.
  const tightCap = !!contextLength && contextLength > 0 && contextLength <= 4096
  const outputReserve = contextLength && contextLength > 0
    ? tightCap
      ? Math.min(1024, Math.max(128, Math.floor(contextLength * 0.5)))
      : Math.min(4096, Math.floor(contextLength * 0.25))
    : 0
  const promptCharBudget = contextLength && contextLength > 0
    ? Math.max(0, contextLength - outputReserve - Math.ceil(CHAT_SYSTEM_PROMPT.length / 3)) * 2
    : Number.POSITIVE_INFINITY
  const fixedChars = ctx.currentDir.length + userMsg.length + 100
  const optionalBudget = Math.max(0, promptCharBudget - fixedChars)
  const smallContext = !!contextLength && contextLength <= 2048
  let listingBudget: number
  let fileBudget: number
  let historyBudget: number
  if (smallContext) {
    const listingShare = ctx.fileContext ? 0.65 : 1
    listingBudget = Math.min(ctx.dirListing.length, Math.floor(optionalBudget * listingShare))
    fileBudget = Math.min(ctx.fileContext.length, Math.max(0, optionalBudget - listingBudget))
    historyBudget = 0
  } else {
    const historyReserve = history.length > 0 ? Math.min(MAX_HISTORY_CHARS, Math.floor(optionalBudget * 0.25)) : 0
    const fileReserve = ctx.fileContext ? Math.min(ctx.fileContext.length, Math.floor(optionalBudget * 0.45)) : 0
    listingBudget = Math.min(ctx.dirListing.length, Math.max(0, optionalBudget - fileReserve - historyReserve))
    fileBudget = Math.min(ctx.fileContext.length, Math.max(0, optionalBudget - listingBudget - historyReserve))
    historyBudget = Math.min(MAX_HISTORY_CHARS, Math.max(0, optionalBudget - listingBudget - fileBudget))
  }
  const listingTruncated = listingBudget < ctx.dirListing.length
  const fileTruncated = fileBudget < ctx.fileContext.length
  const budgetedListing = listingTruncated
    ? truncateListing(ctx.dirListing, listingBudget)
    : ctx.dirListing
  const budgetedFiles = fileTruncated && fileBudget > 24
    ? `${ctx.fileContext.slice(0, fileBudget - 24)}\n…`
    : fileTruncated ? '' : ctx.fileContext
  const { kept, truncated: historyWasTrimmed } = historyBudget > 0
    ? trimHistory(history, historyBudget)
    : { kept: [], truncated: history.length > 0 }
  const truncated = historyWasTrimmed || listingTruncated || fileTruncated

  const workspaceParts: string[] = [
    `Current directory: ${ctx.currentDir}`,
    budgetedListing ? `\nDirectory contents:\n${budgetedListing}` : '',
    budgetedFiles ? `\nSelected/attached file contents:\n${budgetedFiles}` : '',
  ]
  const workspaceText = workspaceParts.filter(Boolean).join('\n')
  const userTurnText = `${workspaceText}\n\nUser request:\n${userMsg}`

  const messages: ModelMessage[] = [
    ...kept.map((m): ModelMessage => ({ role: m.role, content: m.content })),
    ctx.images?.length
      ? {
          role: 'user',
          content: [
            { type: 'text', text: userTurnText },
            ...ctx.images.map((img) => ({
              type: 'image' as const,
              image: img.base64,
              mediaType: img.mimeType,
            })),
          ],
        }
      : { role: 'user', content: userTurnText },
  ]

  const parts: string[] = [
    workspaceText,
    '',
    'Conversation so far:',
    ...kept.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`),
    `User: ${userMsg}`,
    '',
    'Assistant:',
  ]
  return {
    system: CHAT_SYSTEM_PROMPT,
    prompt: parts.filter(Boolean).join('\n'),
    messages,
    truncated,
    ...(tightCap && outputReserve > 0 ? { maxOutputTokens: outputReserve } : {}),
  }
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
