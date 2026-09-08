/**
 * macOS system-location guard (safety feature).
 *
 * Protects the top-level system directories from destructive actions
 * (rename / move-to-trash / move-away) unless the user opts out in Settings.
 * The entry itself is protected; its *children* stay editable — except under
 * `/System` (SIP), which is protected recursively. Mirrored authoritatively in
 * Rust (`src-tauri/src/commands/filesystem.rs::is_protected`).
 */

/** Exact top-level protected entries (compared case-insensitively, normalized). */
export const PROTECTED_ROOTS: string[] = [
  '/', '/Applications', '/Library', '/System', '/usr', '/bin', '/sbin',
  '/private', '/etc', '/var', '/opt', '/cores', '/dev', '/home', '/mnt',
  '/Volumes', '/Network', '/Automount', '/tmp', '/macOS Install Data',
]

/** `/System` and everything below it are protected (SIP-managed). */
const SYSTEM = '/system'

/**
 * Lexically normalize a path for guard comparison: drop `.`/empty segments,
 * resolve `..`, strip trailing slash, lowercase. Does NOT touch the filesystem
 * (no symlink resolution) so `..`-traversal cannot smuggle a protected path past
 * the check. `~` is expected to be expanded by callers (paths arrive absolute).
 */
export function normalizeForGuard(p: string): string {
  const abs = p.startsWith('/')
  const stack: string[] = []
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') {
      stack.pop()
      continue
    }
    stack.push(seg)
  }
  const joined = stack.join('/').toLowerCase()
  return abs ? `/${joined}` : joined
}

const EXACT = new Set(PROTECTED_ROOTS.map(normalizeForGuard))

export function isProtectedPath(path: string): boolean {
  const n = normalizeForGuard(path)
  if (n === SYSTEM || n.startsWith(`${SYSTEM}/`)) return true
  return EXACT.has(n)
}

/** Should a destructive action over `paths` be blocked given the guard state? */
export function blockDestructive(paths: string[], guardOn: boolean): boolean {
  return guardOn && paths.some(isProtectedPath)
}
