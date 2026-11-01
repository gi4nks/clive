/**
 * AI actions (tasks 2.1–2.3). Orchestration only:
 * assemble a budgeted prompt, call the model through the gateway, and turn the
 * raw response into validated, collision-free operations via the safety layer.
 * The filesystem application itself stays in App/Rust; these functions are pure
 * around the single injected model call, so they can be unit-tested by faking
 * `callModel`.
 */
import type { ModelMessage } from 'ai'
import { z } from 'zod'
import i18n from '../i18n'
import { budgetFiles, renderBudgeted, type FileContent } from './budget'
import { generateStructured, streamChat, type AiHealth, type AiResponseMeta } from './runtime'
import { validateNewName, validateRenames, uniqueName, type ValidatedRename } from './safety'

export const ACTION_OPEN = '<<<JSON>>>'
export const ACTION_CLOSE = '<<<END>>>'
export const ACTION_TIMEOUT_MS = 120_000

export interface ActionDeps {
  model: string
  health: AiHealth
  signal?: AbortSignal
  timeoutMs?: number
  onResponse?: (meta: AiResponseMeta) => void
  /** Injected so tests can fake structured calls. */
  callModel?: typeof generateStructured
  /** Injected so tests can fake streaming calls; production uses streamChat. */
  callStream?: typeof streamChat
}

function targetLanguage(): string {
  return i18n.language?.toLowerCase().startsWith('it') ? 'Italian' : 'English'
}

/** Strip `<think>...</think>` blocks and extract a JSON object from delimited, fenced, or raw text. */
export function extractActionJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const open = cleaned.indexOf(ACTION_OPEN)
  const close = cleaned.indexOf(ACTION_CLOSE, open > -1 ? open + ACTION_OPEN.length : 0)
  const candidates: string[] = []
  if (open > -1 && close > open) {
    candidates.push(cleaned.slice(open + ACTION_OPEN.length, close).trim())
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(cleaned)
  if (fenced?.[1]) candidates.push(fenced[1].trim())
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace > -1 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1))
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      /* try next candidate */
    }
  }
  return null
}

async function runActionJson<S extends z.ZodType>(args: {
  deps: ActionDeps
  schema: S
  system: string
  prompt: string
}): Promise<z.output<S>> {
  const timeoutMs = args.deps.timeoutMs ?? ACTION_TIMEOUT_MS
  if (args.deps.callModel && !args.deps.callStream) {
    const out = await args.deps.callModel({
      model: args.deps.model,
      schema: args.schema,
      system: args.system,
      prompt: args.prompt,
      signal: args.deps.signal,
      timeoutMs,
      onResponse: args.deps.onResponse,
    })
    return args.schema.parse(out ?? {})
  }

  const stream = args.deps.callStream ?? streamChat
  let streamError: unknown
  try {
    let raw = ''
    for await (const chunk of stream({
      model: args.deps.model,
      system: `${args.system} Emit ONLY the JSON object wrapped between ${ACTION_OPEN} and ${ACTION_CLOSE}.`,
      prompt: args.prompt,
      signal: args.deps.signal,
      timeoutMs,
      onResponse: args.deps.onResponse,
    })) {
      raw += chunk
    }
    const extracted = extractActionJson(raw)
    if (extracted) {
      const parsed = args.schema.safeParse(extracted)
      if (parsed.success) return parsed.data
    }
    streamError = new Error('Model reply did not contain a valid JSON payload')
  } catch (err) {
    if (args.deps.signal?.aborted) throw err
    streamError = err
  }

  if (args.deps.callStream && !args.deps.callModel) {
    throw streamError
  }

  const call = args.deps.callModel ?? generateStructured
  const fallback = await call({
    model: args.deps.model,
    schema: args.schema,
    system: args.system,
    prompt: args.prompt,
    signal: args.deps.signal,
    timeoutMs,
    onResponse: args.deps.onResponse,
  })
  return args.schema.parse(fallback ?? {})
}

export function aiUnavailable(health: AiHealth): string | null {
  if (!health.ok) return i18n.t('ai.providerUnreachable')
  return null
}

const RenameResponseSchema = z.object({
  renames: z.array(z.object({ path: z.string(), newName: z.string() })).default([]),
})

export interface RenameProposal {
  path: string
  proposed: string
  resolved: ValidatedRename
}

/**
 * Propose human-readable renames for `files`. Returns the validated plan:
 * `resolved.ok` tells whether each row is safe to apply (invalid/unchanged rows
 * are surfaced with an error). Nothing is applied here.
 */
export async function proposeRenames(
  files: FileContent[],
  existingNames: string[],
  deps: ActionDeps,
): Promise<RenameProposal[]> {
  const unavailable = aiUnavailable(deps.health)
  if (unavailable) throw new Error(unavailable)
  const blocks = budgetFiles(files)
  const lang = targetLanguage()
  const system =
    'You are a careful file-renaming assistant. ' +
    'Reply ONLY with JSON { "renames": [ { "path": string, "newName": string } ] }. ' +
    `Use the exact input paths and write descriptive lowercase filenames in ${lang}, preserving each file extension.`
  const prompt =
    'Rename these files with short, descriptive, lowercase names, keeping the extension. ' +
    'Return JSON { "renames": [ { "path": string, "newName": string } ] }.\n\n' +
    renderBudgeted(blocks)
  const out = await runActionJson({
    deps,
    schema: RenameResponseSchema,
    system,
    prompt,
  })
  const ops = (out.renames ?? []).map((r) => ({ path: r.path, newName: r.newName }))
  const validated = validateRenames(ops, existingNames)
  const byPath = new Map(validated.map((v) => [v.path, v]))
  return ops.map((o) => ({
    path: o.path,
    proposed: o.newName,
    resolved: byPath.get(o.path)!,
  }))
}

const SummarySchema = z.object({ summary: z.string() })

/** Produce a short summary/description of the given files (supports vision attachments). */
export async function summarize(
  files: FileContent[],
  deps: ActionDeps,
): Promise<string> {
  const unavailable = aiUnavailable(deps.health)
  if (unavailable) throw new Error(unavailable)
  const blocks = budgetFiles(files)
  const rendered = renderBudgeted(blocks)
  const lang = targetLanguage()
  const timeoutMs = deps.timeoutMs ?? ACTION_TIMEOUT_MS

  if (deps.callModel && !deps.callStream) {
    const out = (await deps.callModel({
      model: deps.model,
      schema: SummarySchema,
      system: `You are an assistant that concisely summarizes files. Always answer in ${lang}. Respond in JSON format.`,
      prompt: rendered,
      signal: deps.signal,
      timeoutMs,
      onResponse: deps.onResponse,
    })) as { summary?: string }
    return out.summary ?? ''
  }

  const images = files.filter((f): f is FileContent & { imageBase64: string } => !!f.imageBase64)
  const messages: ModelMessage[] | undefined = images.length
    ? [
        {
          role: 'user',
          content: [
            { type: 'text', text: rendered },
            ...images.map((img) => ({
              type: 'image' as const,
              image: img.imageBase64,
              mediaType: img.imageMimeType ?? 'image/png',
            })),
          ],
        },
      ]
    : undefined

  const stream = deps.callStream ?? streamChat
  let raw = ''
  for await (const chunk of stream({
    model: deps.model,
    system: `You are an assistant that concisely summarizes files and images. Answer in ${lang} using clear, concise prose (no JSON wrapper).`,
    ...(messages ? { messages } : { prompt: rendered }),
    signal: deps.signal,
    timeoutMs,
    onResponse: deps.onResponse,
  })) {
    raw += chunk
  }
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
    const maybeJson = extractActionJson(cleaned)
    if (typeof maybeJson?.summary === 'string') return maybeJson.summary.trim()
  }
  return cleaned
}

const GenerateSchema = z.object({ name: z.string(), body: z.string() })

export interface GeneratedFile {
  name: string
  body: string
}

/** Generate a new file (name + content) from a prompt; caller confirms before write. */
export async function generateContent(
  instruction: string,
  deps: ActionDeps,
): Promise<GeneratedFile> {
  const unavailable = aiUnavailable(deps.health)
  if (unavailable) throw new Error(unavailable)
  const lang = targetLanguage()
  const out = await runActionJson({
    deps,
    schema: GenerateSchema,
    system:
      `Generate ONE new file: pick a sensible filename (with extension) and the file body. ` +
      `Match the language requested by the user (defaulting to ${lang}). ` +
      'Respond in JSON format { "name": string, "body": string }.',
    prompt: `${instruction}\n\nReturn JSON { "name": string, "body": string }.`,
  })
  return { name: out.name ?? '', body: out.body ?? '' }
}

const OrganizeSchema = z.object({
  groups: z
    .array(z.object({ folder: z.string().default(''), files: z.array(z.string()).default([]) }))
    .default([]),
})

export interface MoveAssignment {
  src: string
  dstFolder: string // '' means stay at root
}

export interface OrganizePlan {
  /** Folders to create (safe names) at the current dir. */
  folders: string[]
  /** Assignments with resolved, collision-free target names. */
  moves: MoveAssignment[]
  /** Files the model referenced but that were not part of the selection. */
  unknown: string[]
}

function baseOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i >= 0 ? path.slice(i + 1) : path
}

/**
 * Turn the model's grouping into a safe move plan. Folder names are validated
 * (rename rules); unknown files are dropped; duplicate assignments keep the
 * first. Nothing is applied here.
 */
export async function proposeOrganize(
  files: FileContent[],
  deps: ActionDeps,
): Promise<OrganizePlan> {
  const unavailable = aiUnavailable(deps.health)
  if (unavailable) throw new Error(unavailable)
  const byPath = new Map(files.map((f) => [f.path, f]))
  const blocks = budgetFiles(files)
  const lang = targetLanguage()
  const out = await runActionJson({
    deps,
    schema: OrganizeSchema,
    system:
      'Organize these files into subfolders by type/topic. ' +
      'Reply ONLY with JSON { "groups": [ { "folder": string, "files": [path] } ] }. ' +
      `Use the exact input paths. Use clear folder names in ${lang}.`,
    prompt: `${renderBudgeted(blocks)}\n\nReturn JSON { "groups": [ { "folder": string, "files": [path] } ] }.`,
  })

  const folders = new Set<string>()
  const moves: MoveAssignment[] = []
  const seen = new Set<string>()
  const unknown: string[] = []

  for (const g of out.groups ?? []) {
    const chk = validateNewName(g.folder)
    // A group with no/invalid folder name means "leave at root".
    const safeFolder = chk.ok && chk.name ? chk.name : ''
    if (safeFolder) folders.add(safeFolder)
      for (const p of g.files) {
        if (!byPath.has(p) || seen.has(p)) {
          if (!byPath.has(p)) unknown.push(p)
          continue
        }
        seen.add(p)
        // A root (empty) or invalid folder name means "leave in place".
        moves.push({ src: p, dstFolder: safeFolder })
      }
  }
  return { folders: [...folders], moves, unknown }
}

/** Convert an OrganizePlan to concrete folder paths + move src/dst for applyPlan. */
export function organizeToApply(plan: OrganizePlan, currentDir: string) {
  const folders = plan.folders.map((f) => `${currentDir}/${f}`)
  // Ensure each folder exists once per destination; de-dup collisions by name.
  const used = new Map<string, Set<string>>() // dstFolder -> names used
  const moves = plan.moves
    .filter((m) => m.dstFolder) // root assignment = no move
    .map((m) => {
      const name = baseOf(m.src)
      const taken = used.get(m.dstFolder) ?? new Set<string>()
      const finalName = uniqueName(name, taken)
      taken.add(finalName)
      used.set(m.dstFolder, taken)
      return { src: m.src, dst: `${currentDir}/${m.dstFolder}/${finalName}` }
    })
  return { folders, moves }
}
