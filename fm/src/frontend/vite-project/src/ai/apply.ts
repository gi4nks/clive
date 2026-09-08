/**
 * Apply + undo (tasks 3.5, 4.5).
 *
 * Executes a *validated* batch of mutations against the injected filesystem
 * commands and records an inverse journal so the whole batch can be reverted
 * in reverse order. Dependency-injected (no direct Tauri import) so it is
 * unit-testable with fakes.
 */
import type { InverseOp } from './safety'

export interface Fs {
  rename: (path: string, newName: string) => Promise<void>
  move: (src: string, dst: string) => Promise<void>
  createFolder: (parent: string, name: string) => Promise<string>
  /** Existence re-check at apply time. */
  exists: (path: string) => Promise<boolean>
}

export interface ApplyRename {
  path: string
  newName: string
}

export interface ApplyMove {
  src: string
  dst: string
}

export interface ApplyPlan {
  renames?: ApplyRename[]
  /** folder paths to create (absolute) */
  folders?: string[]
  moves?: ApplyMove[]
}

export interface ApplyResult {
  applied: number
  skipped: number
  failures: { op: string; error: string }[]
  /** inverse ops, ready to replay with `undo` */
  undo: InverseOp[]
}

function parentOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i > 0 ? path.slice(0, i) : '/'
}
function baseOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i >= 0 ? path.slice(i + 1) : path
}

/**
 * Apply a plan: folders first, then renames, then moves. Each target path is
 * re-checked for existence first (the 2s poller or a prior op may have changed
 * it). Collects inverse operations for undo.
 */
export async function applyPlan(fs: Fs, plan: ApplyPlan): Promise<ApplyResult> {
  const res: ApplyResult = { applied: 0, skipped: 0, failures: [], undo: [] }

  for (const folder of plan.folders ?? []) {
    try {
      await fs.createFolder(parentOf(folder), baseOf(folder))
      res.applied += 1
      res.undo.push({ kind: 'create-folder', path: folder })
    } catch (e) {
      // Folder may already exist; treat as non-fatal skip.
      res.skipped += 1
      void e
    }
  }

  for (const r of plan.renames ?? []) {
    if (!(await fs.exists(r.path))) {
      res.skipped += 1
      continue
    }
    try {
      const previous = baseOf(r.path)
      await fs.rename(r.path, r.newName)
      res.applied += 1
      const newPath = `${parentOf(r.path)}/${r.newName}`
      res.undo.push({ kind: 'rename', path: newPath, restoreName: previous })
    } catch (e) {
      res.failures.push({ op: `rename ${r.path}`, error: String(e) })
    }
  }

  for (const m of plan.moves ?? []) {
    if (!(await fs.exists(m.src))) {
      res.skipped += 1
      continue
    }
    try {
      await fs.move(m.src, m.dst)
      res.applied += 1
      res.undo.push({ kind: 'move', from: m.dst, to: m.src })
    } catch (e) {
      res.failures.push({ op: `move ${m.src}`, error: String(e) })
    }
  }

  return res
}

/** Replay the journal in reverse to revert an applied plan. */
export async function undoPlan(fs: Fs, undo: InverseOp[]): Promise<ApplyResult> {
  const res: ApplyResult = { applied: 0, skipped: 0, failures: [], undo: [] }
  for (const op of [...undo].reverse()) {
    try {
      if (op.kind === 'rename') {
        if (!(await fs.exists(op.path))) {
          res.skipped += 1
          continue
        }
        await fs.rename(op.path, op.restoreName)
        res.applied += 1
      } else if (op.kind === 'move') {
        if (!(await fs.exists(op.from))) {
          res.skipped += 1
          continue
        }
        await fs.move(op.from, op.to)
        res.applied += 1
      } else {
        // create-folder undo: intentionally leaves folders (safe; deleting is
        // destructive and out of scope for undo).
        res.skipped += 1
      }
    } catch (e) {
      res.failures.push({ op: `${op.kind}`, error: String(e) })
    }
  }
  return res
}
