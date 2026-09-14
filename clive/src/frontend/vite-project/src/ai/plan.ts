/**
 * AI Plan pure layer: model JSON -> validated ops against the real listing.
 * No React, no I/O, no Tauri. Types and shapes here are consumed by Tasks 2-6.
 */
import { validateNewName } from './safety.js'
import { isProtectedPath } from '../systemGuard.js'
import type { FileEntry } from '../api.js'

export type { FileEntry } from '../api.js'

export interface ModelRule { match: string; to: string }
export interface ModelPlanShape {
  folders: string[]
  /** Classification rules applied to the REAL listing by the client, so the
   *  model never has to (re)emit hundreds of exact filenames. `match` is a
   *  case-insensitive substring, or an extension when it starts with ".". The
   *  FIRST matching rule wins. */
  rules: ModelRule[]
  renames: { file: string; to: string }[]
  /** Filename patterns (same matching as rules) to send to the Trash. */
  trashPatterns: string[]
  /** Folder for files no rule matches (empty = leave them untouched). */
  fallback?: string
  notes?: string
}
export type PlanOp =
  | { id: string; kind: 'createFolder'; path: string; included: boolean; issue?: string }
  | { id: string; kind: 'rename'; path: string; newName: string; included: boolean; issue?: string }
  | { id: string; kind: 'move'; path: string; destDir: string; included: boolean; issue?: string }
  | { id: string; kind: 'trash'; path: string; included: boolean; issue?: string }
export interface Plan { rootPath: string; ops: PlanOp[]; unchanged: FileEntry[]; warnings: string[]; debugId?: string }
export interface ExpandCtx { rootPath: string; entries: FileEntry[]; guardOn: boolean }

const join = (root: string, rel: string): string => {
  const clean = rel.replace(/^\/+/, '').replace(/\/+$/, '')
  return clean ? `${root.replace(/\/+$/, '')}/${clean}` : root
}

export function validateFolderPath(relPath: string): { ok: boolean; reason?: string; segments?: string[] } {
  if (!relPath) return { ok: false, reason: 'empty' }
  if (relPath.startsWith('/')) return { ok: false, reason: 'absolute path' }
  if (relPath.endsWith('/')) return { ok: false, reason: 'trailing slash' }
  const segments = relPath.split('/')
  if (segments.some((s) => !s)) return { ok: false, reason: 'empty segment' }
  for (const seg of segments) {
    if (seg === '.' || seg === '..') return { ok: false, reason: 'traversal' }
    const chk = validateNewName(seg)
    if (!chk.ok) return { ok: false, reason: chk.reason }
  }
  return { ok: true, segments }
}

function depth(p: string): number {
  return p.split('/').filter(Boolean).length
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function expandPlan(json: ModelPlanShape, ctx: ExpandCtx): Plan {
  const ops: PlanOp[] = []
  const warnings: string[] = []
  let seq = 0
  const nextId = (k: string) => `${k}:${seq++}`
  const byName = new Map<string, FileEntry>()
  for (const e of ctx.entries) if (!byName.has(e.name)) byName.set(e.name, e)

  // 1. folders: expand each into cumulative createFolder chain, deduped, depth asc
  const seenFolders = new Set<string>()
  const folderAdds: PlanOp[] = []
  const addFolderChain = (rel: string): string => {
    const clean = rel.replace(/^\/+/, '').replace(/\/+$/, '')
    if (!clean) return ctx.rootPath
    const parts = clean.split('/')
    let acc = ''
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part
      if (seenFolders.has(acc)) continue
      const v = validateFolderPath(acc)
      const absPath = join(ctx.rootPath, acc)
      seenFolders.add(acc)
      const clash = ctx.entries.some((e) => e.path === absPath)
      const issue = !v.ok ? 'invalid folder path' : guardBlock(absPath) ?? (clash ? 'target exists' : undefined)
      folderAdds.push({ id: nextId('createFolder'), kind: 'createFolder', path: absPath, included: !issue, issue })
    }
    return join(ctx.rootPath, clean)
  }

  // 2. resolve a basename to a listing entry with tolerant matching:
  // exact -> case-insensitive -> " (N)" suffix variant.
  const resolve = (name: string): FileEntry | undefined => {
    if (byName.has(name)) return byName.get(name)
    const lower = name.toLowerCase()
    const ci = ctx.entries.find((e) => e.name.toLowerCase() === lower)
    if (ci) return ci
    const re = new RegExp(`^${escapeRegExp(name)} \\(\\d+\\)$`)
    return ctx.entries.find((e) => re.test(e.name))
  }

  const guardBlock = (abs: string): string | undefined => (ctx.guardOn && isProtectedPath(abs) ? 'protected' : undefined)

  // top-level folder declarations create their chains too
  for (const f of json.folders ?? []) addFolderChain(f)

  // rename ops (before moves so we can rename then place)
  for (const r of json.renames ?? []) {
    const src = resolve(r.file)
    const id = nextId('rename')
    if (!src) {
      ops.push({ id, kind: 'rename', path: r.file, newName: r.to, included: false, issue: 'not found' })
      warnings.push(`rename unknown: ${r.file}`)
      continue
    }
    const chk = validateNewName(r.to)
    const g = guardBlock(src.path)
    const clash = ctx.entries.some((e) => e !== src && e.name === chk.name)
    const issue = !chk.ok ? 'invalid name' : g ? 'protected' : clash ? 'target exists' : undefined
    ops.push({ id, kind: 'rename', path: src.path, newName: chk.name ?? r.to, included: !issue, issue })
  }

  // rule-based assignment applied to the REAL listing. A rule `match` is a
  // case-insensitive substring, or an extension when it starts with ".".
  const entryMatches = (name: string, match: string): boolean => {
    const m = (match ?? '').trim().toLowerCase()
    if (!m) return false
    if (m.startsWith('__exact__')) return name.toLowerCase() === m.slice('__exact__'.length)
    return m.startsWith('.') ? name.toLowerCase().endsWith(m) : name.toLowerCase().includes(m)
  }
  const selfContained = (srcPath: string, destAbs: string): boolean =>
    destAbs === srcPath || destAbs.startsWith(`${srcPath}/`)

  const touchedEntries = new Set<string>()
  const ruleHits = new Map<string, number>() // rule.to -> count (for no-match warnings)

  // Trash patterns first (a temp/dup file must not be "organized"), then rules,
  // then the optional fallback. Each entry yields at most one op.
  for (const e of ctx.entries) {
    if (e.path === ctx.rootPath) continue
    const trashHit = (json.trashPatterns ?? []).some((p) => entryMatches(e.name, p))
    if (trashHit) {
      const g = guardBlock(e.path)
      ops.push({ id: nextId('trash'), kind: 'trash', path: e.path, included: !g, issue: g ? 'protected' : undefined })
      touchedEntries.add(e.path)
      continue
    }
    const hit = (json.rules ?? []).find((r) => entryMatches(e.name, r.match))
    const destRel = hit ? hit.to : (json.fallback ?? '').trim()
    if (!destRel) continue // unmatched and no fallback -> untouched
    const destAbs = addFolderChain(destRel)
    if (destAbs === ctx.rootPath) continue // no-op move into current dir
    if (hit) ruleHits.set(hit.to, (ruleHits.get(hit.to) ?? 0) + 1)
    if (e.isDir && selfContained(e.path, destAbs)) {
      ops.push({ id: nextId('move'), kind: 'move', path: e.path, destDir: destAbs, included: false, issue: 'invalid destination' })
      touchedEntries.add(e.path)
      continue
    }
    const g = guardBlock(e.path) || guardBlock(destAbs)
    ops.push({ id: nextId('move'), kind: 'move', path: e.path, destDir: destAbs, included: !g, issue: g ? 'protected' : undefined })
    touchedEntries.add(e.path)
  }
  for (const r of json.rules ?? []) {
    if (!ruleHits.has(r.to)) warnings.push(`rule matched nothing: ${r.match} -> ${r.to}`)
  }

  // prepend folder creates, ordered by depth (parent before child)
  const ordered = [...folderAdds.sort((a, b) => depth(a.path) - depth(b.path))]
  const all = [...ordered, ...ops]

  const unchanged = ctx.entries.filter((e) => !touchedEntries.has(e.path) && e.path !== ctx.rootPath)

  return { rootPath: ctx.rootPath, ops: all, unchanged, warnings }
}

export function orderPlanOps(ops: PlanOp[]): PlanOp[] {
  const rank = (k: PlanOp['kind']) => (k === 'createFolder' ? 0 : k === 'rename' ? 1 : k === 'move' ? 2 : 3)
  return [...ops].sort((a, b) => rank(a.kind) - rank(b.kind) || depth(a.path) - depth(b.path))
}
