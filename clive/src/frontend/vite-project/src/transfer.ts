/**
 * File transfer helpers (dual-pane-navigation, task 3.x/4.x).
 * A transfer = copy or move a set of source paths into a destination dir,
 * never clobbering: colliding names get a unique suffix (same rule as the Rust
 * `paste_paths` / `ai/safety.uniqueName`). Pure so it is unit-testable; the
 * actual `copy_file`/`move_file` calls are driven by `runTransfer`.
 */
import { basename, uniqueName } from './ai/safety'
import { copyFile, moveFile, transferItems } from './api'

export type { TransferResult } from './api'
export interface TransferOutcome {
  applied: number
  failures: { src: string; error: string }[]
  nonAtomic?: boolean
}

export type TransferMode = 'copy' | 'move'

export interface TransferOp {
  src: string
  dst: string // full destination path, collision-free
}

/** Destination dir separator-safe join. */
function joinDir(dir: string, name: string): string {
  const base = dir.replace(/\/+$/, '')
  return `${base}/${name}` // base may be '' → "/name"
}

/**
 * Build collision-free operations. `existingNames` are the destination folder's
 * current entries (we can't know a dir's own current name → pass all listed
 * names; sources that live in the same dir should exclude themselves first).
 * `isDirOf(src)` decides whether the unique suffix treats the name as a folder.
 */
export function planTransfer(
  srcPaths: string[],
  dstDir: string,
  existingNames: string[],
  isDir: (src: string) => boolean = () => false,
): TransferOp[] {
  const taken = new Set(existingNames)
  const ops: TransferOp[] = []
  for (const src of srcPaths) {
    const name = basename(src)
    const final = uniqueName(name, taken, isDir(src))
    taken.add(final)
    ops.push({ src, dst: joinDir(dstDir, final) })
  }
  return ops
}

/** Execute planned ops; returns per-op result (ok/error). */
export async function runTransfer(
  ops: TransferOp[],
  mode: TransferMode,
): Promise<{ applied: number; failures: { src: string; error: string }[] }> {
  const failures: { src: string; error: string }[] = []
  let applied = 0
  for (const op of ops) {
    try {
      if (mode === 'copy') await copyFile(op.src, op.dst)
      else await moveFile(op.src, op.dst)
      applied += 1
    } catch (e) {
      failures.push({ src: op.src, error: String(e) })
    }
  }
  return { applied, failures }
}

/**
 * Transfer `paths` into `dstDir` with collision-free naming. Preferred: the
 * Rust `transfer_items` batch command (one round-trip). An ambiguous failure
 * is reported without retrying mutations that may already have completed.
 */
export async function transferBatch(
  paths: string[],
  dstDir: string,
  mode: TransferMode,
): Promise<TransferOutcome> {
  if (!paths.length) return { applied: 0, failures: [] }
  try {
    const res = await transferItems(paths, dstDir, mode)
    return { applied: res.applied, failures: res.failures, nonAtomic: res.nonAtomic }
  } catch (error) {
    // An IPC failure may arrive after mutations. Never replay the batch.
    return { applied: 0, failures: paths.map((src) => ({ src, error: String(error) })) }
  }
}
