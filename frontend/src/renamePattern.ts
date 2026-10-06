/**
 * Pure multi-rename engine (feature "rinomina multipla con pattern"):
 * expands a token pattern (or applies find/replace) over the visible file
 * names and produces the review rows (validation + duplicate detection).
 * No React, no fs — everything is unit-testable.
 */
import { validateNewName } from './ai/safety'

export interface RenameSource {
  name: string
  isDir: boolean
  modified: number // unix seconds (FileEntry.modified)
  path?: string
}

export interface PatternOptions {
  pattern: string
  find: string
  replace: string
  useRegex: boolean
  startIndex: number
}

export interface RenameRow {
  path: string
  source: string
  target: string
  ok: boolean
  reason?: 'invalid' | 'dup' | 'regex'
  enabled: boolean
}

export function splitName(name: string, isDir: boolean): { stem: string; ext: string } {
  if (isDir) return { stem: name, ext: '' }
  const i = name.lastIndexOf('.')
  if (i <= 0) return { stem: name, ext: '' }
  return { stem: name.slice(0, i), ext: name.slice(i + 1) }
}

function pad(n: number, width?: string): string {
  const s = String(n)
  return width ? s.padStart(Math.max(1, parseInt(width, 10) || 1), '0') : s
}

function titleCase(s: string): string {
  return s.replace(/(^|[\s._-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
}

function fmtDate(modified: number, fmt: string): string {
  const d = new Date(modified * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  const parts: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    MM: p(d.getMonth() + 1),
    DD: p(d.getDate()),
    HH: p(d.getHours()),
    mm: p(d.getMinutes()),
    ss: p(d.getSeconds()),
  }
  return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, (t) => parts[t])
}

/** Replace `{token}` occurrences. Counter is 1-based unless startIndex given. */
export function expandPattern(pattern: string, src: RenameSource, n?: number): string {
  const { stem, ext } = splitName(src.name, src.isDir)
  const idx = n ?? 1
  return pattern.replace(/\{(n(?:>\d+)?|name|NAME|name_lower|Title|ext|date(?::[^{}]+)?)\}/g, (_m, token: string) => {
    if (token === 'name') return stem
    if (token === 'NAME') return stem.toUpperCase()
    if (token === 'name_lower') return stem.toLowerCase()
    if (token === 'Title') return titleCase(stem)
    if (token === 'ext') return ext
    if (token === 'n' || token.startsWith('n>')) return pad(idx, token.length > 1 ? token.slice(2) : undefined)
    if (token === 'date' || token.startsWith('date:')) return fmtDate(src.modified, token === 'date' ? 'YYYY-MM-DD' : token.slice(5))
    return _m
  })
}

function applyFindReplace(target: string, opts: PatternOptions): string | null {
  if (!opts.find) return target
  if (opts.useRegex) {
    const expr = opts.find.match(/^#([\s\S]*)#$/)?.[1] ?? opts.find
    try {
      // `{$1}` groups keep `$` from colliding with plain text
      return target.replace(new RegExp(expr, 'g'), opts.replace.replace(/\{\$(\d+)\}/g, '$$$1'))
    } catch {
      return null
    }
  }
  return target.split(opts.find).join(opts.replace)
}

/**
 * Build review rows for `sources` in display order (the counter follows this
 * order). `path` defaults to the name when the source has none (tests).
 */
export function computeRows(sources: RenameSource[], opts: PatternOptions): RenameRow[] {
  const raw = sources.map((s, i) => {
    if (opts.find && opts.useRegex) {
      const probe = applyFindReplace('probe', opts)
      if (probe === null) return { s, target: '', regexError: true }
    }
    const expanded = expandPattern(opts.pattern, s, opts.startIndex + i)
    const target = applyFindReplace(expanded, opts)
    return { s, target: target ?? '', regexError: target === null }
  })
  const seen = new Set<string>()
  return raw.map((r) => {
    if (r.regexError) return { path: r.s.path ?? r.s.name, source: r.s.name, target: '', ok: false, reason: 'regex' as const, enabled: true }
    const check = validateNewName(r.target)
    if (!check.ok) return { path: r.s.path ?? r.s.name, source: r.s.name, target: r.target, ok: false, reason: 'invalid' as const, enabled: true }
    // First occurrence wins; later rows colliding with it (or with an existing
    // source name that is itself being renamed away) are duplicates.
    const dup = seen.has(check.name!)
    seen.add(check.name!)
    return { path: r.s.path ?? r.s.name, source: r.s.name, target: check.name!, ok: !dup, reason: dup ? 'dup' : undefined, enabled: true }
  })
}
