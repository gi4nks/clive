/**
 * AI Plan pure layer: model JSON -> validated ops against the real listing.
 * No React, no I/O, no Tauri. Types and shapes here are consumed by Tasks 2-6.
 */
import { validateNewName } from './safety.js'
import { isProtectedPath } from '../systemGuard.js'
import type { FileEntry } from '../api.js'

export type { FileEntry } from '../api.js'

export interface ModelPlanShape {
  folders: string[]
  assignments: { file: string; to: string }[]
  renames: { file: string; to: string }[]
  trash: { file: string }[]
  notes?: string
}
export type PlanOp =
  | { id: string; kind: 'createFolder'; path: string; included: boolean; issue?: string }
  | { id: string; kind: 'rename'; path: string; newName: string; included: boolean; issue?: string }
  | { id: string; kind: 'move'; path: string; destDir: string; included: boolean; issue?: string }
  | { id: string; kind: 'trash'; path: string; included: boolean; issue?: string }
export interface Plan { rootPath: string; ops: PlanOp[]; unchanged: FileEntry[]; warnings: string[] }
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
      folderAdds.push({ id: nextId('createFolder'), kind: 'createFolder', path: absPath, included: v.ok, issue: v.ok ? undefined : 'invalid folder path' })
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

  // top-level folder declarations create their chains too
  for (const f of json.folders ?? []) addFolderChain(f)

  const guardBlock = (abs: string): string | undefined => (ctx.guardOn && isProtectedPath(abs) ? 'protected' : undefined)

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

  // assignment moves
  const assigned = new Set<string>()
  const sourcesTouched = new Set<string>()
  for (const a of json.assignments ?? []) {
    const src = resolve(a.file)
    const id = nextId('move')
    if (!src) {
      ops.push({ id, kind: 'move', path: a.file, destDir: '', included: false, issue: 'not found' })
      warnings.push(`assign unknown: ${a.file}`)
      continue
    }
    sourcesTouched.add(src.path)
    const destAbs = addFolderChain(a.to)
    if (destAbs === ctx.rootPath) continue // no-op move to current dir
    if (assigned.has(src.path)) {
      for (const o of ops) {
        if (o.kind === 'move' && o.path === src.path) {
          o.included = false
          o.issue = 'duplicate move'
        }
      }
    }
    assigned.add(src.path)
    const g = guardBlock(src.path) || guardBlock(destAbs)
    ops.push({ id, kind: 'move', path: src.path, destDir: destAbs, included: !g, issue: g ? 'protected' : undefined })
  }

  // trash ops
  for (const t of json.trash ?? []) {
    const src = resolve(t.file)
    const id = nextId('trash')
    if (!src) {
      ops.push({ id, kind: 'trash', path: t.file, included: false, issue: 'not found' })
      warnings.push(`trash unknown: ${t.file}`)
      continue
    }
    const g = guardBlock(src.path)
    ops.push({ id, kind: 'trash', path: src.path, included: !g, issue: g ? 'protected' : undefined })
  }

  // prepend folder creates, ordered by depth (parent before child)
  const ordered = [...folderAdds.sort((a, b) => depth(a.path) - depth(b.path))]
  const all = [...ordered, ...ops]

  const touched = new Set<string>(sourcesTouched)
  for (const o of all) touched.add(o.path)
  const unchanged = ctx.entries.filter((e) => !touched.has(e.path))

  return { rootPath: ctx.rootPath, ops: all, unchanged, warnings }
}

export function orderPlanOps(ops: PlanOp[]): PlanOp[] {
  const rank = (k: PlanOp['kind']) => (k === 'createFolder' ? 0 : k === 'rename' ? 1 : k === 'move' ? 2 : 3)
  return [...ops].sort((a, b) => rank(a.kind) - rank(b.kind) || depth(a.path) - depth(b.path))
}
