/**
 * AI action-safety primitives (task 3.x).
 *
 * Pure, frontend-side validation and undo-inversion for AI-proposed file
 * operations. These mirror the rules the Rust `rename` command enforces, so a
 * proposed plan can be checked before anything is applied to disk. No I/O.
 */
import i18n from '../i18n'

/** Result of validating a single proposed target name. */
export interface NameCheck {
  ok: boolean
  /** Trimmed, safe name when ok. */
  name?: string
  /** Human-readable reason when not ok. */
  reason?: string
}

/** Mirror of src-tauri `rename`: non-empty, not `.`/`..`, no path separator. */
export function validateNewName(raw: string): NameCheck {
  const name = (raw ?? '').trim()
  if (!name) return { ok: false, reason: i18n.t('validate.emptyName') }
  if (name === '.' || name === '..') return { ok: false, reason: i18n.t('validate.invalidName') }
  if (name.includes('/') || name.includes('\0'))
    return { ok: false, reason: i18n.t('validate.noPath') }
  return { ok: true, name }
}

/** Last path segment (works for `/`-separated absolute paths). */
export function basename(path: string): string {
  const clean = path.replace(/\/+$/, '')
  const i = clean.lastIndexOf('/')
  return i >= 0 ? clean.slice(i + 1) : clean
}

/** Split a name into stem + extension (dirs keep the whole name as stem). */
function splitName(name: string, isDir: boolean): { stem: string; ext: string } {
  if (isDir) return { stem: name, ext: '' }
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return { stem: name, ext: '' }
  return { stem: name.slice(0, dot), ext: name.slice(dot) } // ext includes the dot
}

/** Deterministic "unique destination" suffix, like the Rust `make_unique_dst`. */
export function uniqueName(name: string, taken: Set<string>, isDir = false): string {
  if (!taken.has(name)) return name
  const { stem, ext } = splitName(name, isDir)
  let i = 1
  let candidate: string
  do {
    candidate = `${stem} copy ${i}${ext}`
    i += 1
  } while (taken.has(candidate))
  return candidate
}

export interface RenameOp {
  /** Absolute path of the item to rename. */
  path: string
  /** AI-proposed new name (may be invalid/colliding). */
  newName: string
}

export interface ValidatedRename {
  path: string
  /** Original name (derived from path). */
  from: string
  /** Final safe name to apply. */
  to: string
  /** True if the operation should be applied. */
  ok: boolean
  /** Reason when not ok. */
  error?: string
}

/**
 * Validate a batch of proposed renames against on-disk siblings (`existingNames`,
 * the current directory listing) and against each other:
 * - illegal names are flagged (never auto-fixed);
 * - a rename to the item's own current name is a no-op (`ok:false`);
 * - collisions (with disk or within the batch) are resolved with a unique suffix.
 */
export function validateRenames(
  ops: RenameOp[],
  existingNames: string[],
  isDir: (path: string) => boolean = () => false,
): ValidatedRename[] {
  // Names that are being renamed away free up during the batch; a proposed
  // target colliding only with a vacated name (or the item's own old name) is
  // fine. Anything still on disk that is NOT renamed away, or already claimed
  // by an earlier target, is a genuine collision.
  const vacating = new Set(ops.map((o) => basename(o.path)))
  const stillOnDisk = new Set(existingNames.filter((n) => !vacating.has(n)))
  const claimed = new Set<string>()
  const out: ValidatedRename[] = []

  for (const op of ops) {
    const from = basename(op.path)
    const check = validateNewName(op.newName)
    if (!check.ok) {
      out.push({ path: op.path, from, to: op.newName, ok: false, error: check.reason })
      continue
    }
    const desired = check.name!
    if (desired === from) {
      // No change for this item; leave it out of the applied batch.
      out.push({ path: op.path, from, to: desired, ok: false, error: i18n.t('validate.noChange') })
      continue
    }
    const taken = new Set<string>([...stillOnDisk, ...claimed])
    const final = taken.has(desired) ? uniqueName(desired, taken, isDir(op.path)) : desired
    claimed.add(final)
    out.push({ path: op.path, from, to: final, ok: true })
  }
  return out
}
