/**
 * AI actions (tasks 2.1–2.3). Orchestration only:
 * assemble a budgeted prompt, call the model through the gateway, and turn the
 * raw response into validated, collision-free operations via the safety layer.
 * The filesystem application itself stays in App/Rust; these functions are pure
 * around the single injected model call, so they can be unit-tested by faking
 * `callModel`.
 */
import { z } from 'zod'
import i18n from '../i18n'
import { budgetFiles, renderBudgeted, type FileContent } from './budget'
import { generateStructured, type AiHealth } from './runtime'
import { validateNewName, validateRenames, uniqueName, type ValidatedRename } from './safety'

export interface ActionDeps {
  model: string
  health: AiHealth
  signal?: AbortSignal
  /** Injected so tests can fake the model; production passes generateStructured. */
  callModel?: typeof generateStructured
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
  const prompt =
    'Rename these files with short, descriptive, lowercase names, keeping the extension. ' +
    'Reply ONLY with JSON { "renames": [ { "path": string, "newName": string } ] }. ' +
    'Use the exact input paths and write all names in English.\n\n' +
    renderBudgeted(blocks)
  const call = deps.callModel ?? generateStructured
  const out = (await call({
    model: deps.model,
    schema: RenameResponseSchema,
    prompt,
    signal: deps.signal,
  })) as { renames?: { path: string; newName: string }[] }
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

/** Produce a short summary/description of the given files. */
export async function summarize(
  files: FileContent[],
  deps: ActionDeps,
): Promise<string> {
  const unavailable = aiUnavailable(deps.health)
  if (unavailable) throw new Error(unavailable)
  const blocks = budgetFiles(files)
  const call = deps.callModel ?? generateStructured
  const out = (await call({
    model: deps.model,
    schema: SummarySchema,
    system: 'You are an assistant that concisely summarizes files. Always answer in English. Respond in JSON format.',
    prompt: renderBudgeted(blocks),
    signal: deps.signal,
  })) as { summary?: string }
  return out.summary ?? ''
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
  const call = deps.callModel ?? generateStructured
  const out = (await call({
    model: deps.model,
    schema: GenerateSchema,
    system: 'Generate ONE new file: pick a sensible name (with extension) and the content. Respond in English. Respond in JSON format.',
    prompt: instruction,
    signal: deps.signal,
  })) as { name?: string; body?: string }
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
  const call = deps.callModel ?? generateStructured
  const out = (await call({
    model: deps.model,
    schema: OrganizeSchema,
    system:
      'Organize these files into subfolders by type/topic. ' +
      'Reply ONLY with JSON { "groups": [ { "folder": string, "files": [path] } ] }. ' +
      'Use the exact input paths. Use English folder names.',
    prompt: renderBudgeted(blocks),
    signal: deps.signal,
  })) as { groups?: { folder: string; files: string[] }[] }

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
