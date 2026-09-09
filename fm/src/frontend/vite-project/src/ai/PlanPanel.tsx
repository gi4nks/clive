import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { usePlan } from './usePlan.js'
import type { Plan, PlanOp } from './plan.js'
import type { FileEntry } from '../api.js'
import { FileIcon } from '../FileIcon.js'

/**
 * AI Plan review/apply modal (Task 5 of the AI plan). The `ctrl` is the
 * App-owned usePlan controller (Task 4) passed as a prop. Golden rule (spec
 * §7): nothing executes without Apply, and ops that arrived with an `issue`
 * are permanently excluded and read-only (updateOp/toggleOp lock them).
 */
export interface PlanPanelProps {
  ctrl: ReturnType<typeof usePlan>
  onClose: () => void
}

const strip = (p: string) => p.replace(/\/+$/, '') || '/'
const baseOf = (p: string) => p.slice(p.lastIndexOf('/') + 1) || p
const parentOf = (p: string) => {
  const i = strip(p).lastIndexOf('/')
  return i <= 0 ? '/' : strip(p).slice(0, i)
}

interface TreeNode {
  path: string
  label: string
  createOp?: PlanOp
  items: PlanOp[]
  children: TreeNode[]
}

export function buildPlanTree(plan: Plan): TreeNode {
  const rootPath = strip(plan.rootPath)
  const nodes = new Map<string, TreeNode>()
  const nodeFor = (path: string): TreeNode => {
    const p = strip(path)
    let n = nodes.get(p)
    if (!n) {
      n = { path: p, label: baseOf(p), items: [], children: [] }
      nodes.set(p, n)
    }
    return n
  }
  const root = nodeFor(rootPath)
  for (const op of plan.ops) if (op.kind === 'createFolder') nodeFor(op.path).createOp = op
  for (const op of plan.ops) {
    if (op.kind === 'move') nodeFor(op.destDir).items.push(op)
    else if (op.kind === 'rename' || op.kind === 'trash') nodeFor(parentOf(op.path)).items.push(op)
  }
  for (const n of nodes.values()) {
    if (n === root) continue
    let anc = parentOf(n.path)
    while (anc !== '/' && !nodes.has(anc)) anc = parentOf(anc)
    const pn = nodes.get(anc) ?? root
    if (pn !== n && !pn.children.includes(n)) pn.children.push(n)
  }
  const sortRec = (n: TreeNode) => {
    n.children.sort((a, b) => a.label.localeCompare(b.label))
    n.children.forEach(sortRec)
  }
  sortRec(root)
  return root
}

const ISSUE_KEYS: Record<string, string> = {
  'not found': 'plan.notFound',
  protected: 'plan.protected',
  'target exists': 'plan.targetExists',
  'duplicate move': 'plan.duplicate',
  'invalid folder path': 'plan.invalidDest',
  'invalid name': 'plan.invalidName',
  'empty path': 'plan.invalidName',
  'empty destination': 'plan.invalidDest',
  'invalid destination': 'plan.invalidDest',
  'destination folder missing': 'plan.invalidDest',
  'cannot trash the trash directory': 'plan.cannotTrash',
  'cannot move the trash directory': 'plan.cannotTrash',
}

const fakeEntry = (path: string, isDir: boolean): FileEntry => ({
  name: baseOf(path),
  path,
  isDir,
  size: 0,
  modified: 0,
  extension: isDir ? null : (baseOf(path).match(/\.[^.]+$/)?.[0].slice(1) ?? null),
})

function OpCheckbox({ op, onToggle }: { op: PlanOp; onToggle: (id: string) => void }) {
  return (
    <label className="flex shrink-0 items-center gap-1">
      <input
        type="checkbox"
        className="checkbox checkbox-xs"
        checked={op.included && !op.issue}
        disabled={!!op.issue}
        onChange={() => {
          if (op.issue) return
          onToggle(op.id)
        }}
        aria-label={baseOf(op.kind === 'rename' ? op.newName : op.path)}
      />
      <span className="sr-only">{baseOf(op.path)}</span>
    </label>
  )
}

export function PlanPanel({ ctrl, onClose }: PlanPanelProps) {
  const { t } = useTranslation()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { plan, phase, progress, report, undoReport, error } = ctrl

  useEffect(() => {
    if (phase === 'idle') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (phase === 'applying') return
      if (confirmOpen) {
        setConfirmOpen(false)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, confirmOpen, onClose])

  if (phase === 'idle' || !plan) return null

  const numOps = (k: PlanOp['kind']) => plan.ops.filter((o) => o.kind === k).length
  const trashArmed = plan.ops.filter((o) => o.kind === 'trash' && o.included && !o.issue).length
  const rel = (p: string) => {
    const root = strip(plan.rootPath)
    return strip(p).startsWith(root + '/') ? strip(p).slice(root.length + 1) : strip(p)
  }
  const labelFor = (s: string) => {
    const key = ISSUE_KEYS[s] ?? (s.startsWith('Protected') ? 'plan.protected' : undefined)
    return key ? t(key) : s
  }
  const onBackdrop = () => {
    if (phase === 'applying') return
    if (confirmOpen) {
      setConfirmOpen(false)
      return
    }
    onClose()
  }
  const startApply = () => {
    if (trashArmed > 0) setConfirmOpen(true)
    else void ctrl.apply()
  }

  const folders = plan.ops.filter((o) => o.kind === 'createFolder')
  const renderMoveSelect = (op: PlanOp & { kind: 'move' }) => (
    <label className="flex items-center gap-1 text-xs opacity-80">
      {t('plan.reassign')}
      <select
        className="select select-xs select-bordered max-w-[16rem]"
        value={op.destDir}
        disabled={!!op.issue}
        onChange={(e) => ctrl.updateOp(op.id, { destDir: e.target.value })}
      >
        <option value={strip(plan.rootPath)}>{t('plan.root')}</option>
        {folders.map((f) => f.kind === 'createFolder' && (
          <option key={f.id} value={f.path}>{rel(f.path)}</option>
        ))}
      </select>
    </label>
  )

  const renderOp = (op: PlanOp, depth: number) => {
    const pad = { paddingLeft: `${depth * 18}px` }
    const badge = op.issue ? (
      <span className="badge badge-error badge-outline badge-xs shrink-0">{labelFor(op.issue)}</span>
    ) : null
    if (op.kind === 'move') {
      return (
        <div key={op.id} className="flex items-center gap-2 py-1" style={pad}>
          <OpCheckbox op={op} onToggle={ctrl.toggleOp} />
          <FileIcon entry={fakeEntry(op.path, false)} />
          <span className="truncate">{baseOf(op.path)}</span>
          <span className="opacity-60">→</span>
          <span className="truncate opacity-80">{rel(op.destDir)}/</span>
          {badge}
          {renderMoveSelect(op)}
        </div>
      )
    }
    if (op.kind === 'rename') {
      return (
        <div key={op.id} className="flex items-center gap-2 py-1" style={pad}>
          <OpCheckbox op={op} onToggle={ctrl.toggleOp} />
          <FileIcon entry={fakeEntry(op.path, false)} />
          <span className="truncate">{baseOf(op.path)}</span>
          <span className="opacity-60">→</span>
          <input
            type="text"
            className="input input-xs input-bordered w-40"
            value={op.newName}
            disabled={!!op.issue}
            onChange={(e) => ctrl.updateOp(op.id, { newName: e.target.value })}
          />
          {badge}
        </div>
      )
    }
    if (op.kind === 'trash') {
      return (
        <div key={op.id} className="flex items-center gap-2 py-1" style={pad}>
          <OpCheckbox op={op} onToggle={ctrl.toggleOp} />
          <FileIcon entry={fakeEntry(op.path, false)} />
          <span className="truncate">{baseOf(op.path)}</span>
          <span className="badge badge-error badge-xs shrink-0">{t('plan.trash')}</span>
          {badge}
        </div>
      )
    }
    return null
  }

  const renderNode = (node: TreeNode, depth: number) => (
    <div key={node.path}>
      <div className="flex items-center gap-2 py-1" style={{ paddingLeft: `${depth * 18}px` }}>
        {node.createOp ? (
          <OpCheckbox op={node.createOp} onToggle={ctrl.toggleOp} />
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <FileIcon entry={fakeEntry(node.path, true)} />
        {node.createOp && !node.createOp.issue ? (
          <input
            type="text"
            className="input input-xs input-bordered w-40"
            value={node.label}
            onChange={(e) =>
              ctrl.updateOp(node.createOp!.id, { path: `${parentOf(node.path)}/${e.target.value}` })
            }
          />
        ) : (
          <span className="font-medium">{node.label}</span>
        )}
        {node.createOp && <span className="badge badge-info badge-outline badge-xs shrink-0">{t('plan.newFolder')}</span>}
        {node.createOp?.issue ? (
          <span className="badge badge-error badge-outline badge-xs shrink-0">{labelFor(node.createOp.issue)}</span>
        ) : null}
      </div>
      {node.items.map((op) => renderOp(op, depth + 1))}
      {node.children.map((ch) => renderNode(ch, depth + 1))}
    </div>
  )

  const tree = buildPlanTree(plan)
  const locked = phase === 'applying'
  const activeReport = phase === 'undone' ? undoReport : report

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" data-plan-panel>
      <div className="modal-backdrop bg-black/40" onClick={onBackdrop} />
      <div
        className="modal-box relative flex max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl p-0 shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="border-b border-base-300 px-5 py-4">
          <h3 className="text-lg font-bold">{t('plan.title')}</h3>
          <div className="text-sm opacity-70">{plan.rootPath}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs opacity-90">
            <span>{numOps('createFolder')} {t('plan.create')}</span>
            <span>{numOps('move')} {t('plan.move')}</span>
            <span>{numOps('rename')} {t('plan.rename')}</span>
            <span>{numOps('trash')} {t('plan.trash')}</span>
            <span>{plan.unchanged.length} {t('plan.untouched')}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
          {phase === 'applying' ? (
            <div className="flex flex-col gap-2 py-6">
              <div className="text-sm">{t('plan.applying')}</div>
              <progress
                className="progress progress-primary w-full"
                value={progress?.done ?? 0}
                max={progress?.total ?? 1}
              />
              {progress?.currentId ? (
                <div className="truncate text-xs opacity-60">{progress.currentId}</div>
              ) : null}
            </div>
          ) : activeReport ? (
            <div className="flex flex-col gap-2 py-2">
              <div className="text-sm font-semibold">{t('plan.report')}</div>
              <div className="flex gap-4 text-sm">
                <span>{activeReport.applied} {t('plan.applied')}</span>
                <span>{activeReport.skipped} {t('plan.skipped')}</span>
                <span>{activeReport.failed.length} {t('plan.failed')}</span>
              </div>
              {activeReport.failed.map((f) => (
                <div key={`${f.id}-${f.error}`} className="flex items-center gap-2 text-xs">
                  <span className="badge badge-error badge-xs shrink-0">{labelFor(f.error)}</span>
                  <span className="truncate opacity-80">{f.id}</span>
                </div>
              ))}
            </div>
          ) : phase === 'error' ? (
            <div className="alert alert-error text-sm">{error ?? 'error'}</div>
          ) : (
            <div>{renderNode(tree, 0)}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-base-300 px-5 py-3">
          {phase === 'review' || phase === 'applying' ? (
            <>
              <button className="btn btn-ghost btn-sm" disabled={locked} onClick={onClose}>
                {t('plan.cancel')}
              </button>
              <button className="btn btn-primary btn-sm" disabled={locked} onClick={startApply}>
                {t('plan.apply')}
              </button>
            </>
          ) : null}
          {phase === 'applied' ? (
            <>
              <button className="btn btn-ghost btn-sm" onClick={onClose}>{t('plan.close')}</button>
              <button className="btn btn-warning btn-sm" onClick={() => void ctrl.undo()}>
                {t('plan.undoAll')}
              </button>
            </>
          ) : null}
          {phase === 'undone' ? (
            <button className="btn btn-primary btn-sm" onClick={onClose}>{t('plan.close')}</button>
          ) : null}
          {phase === 'error' ? (
            <>
              <button className="btn btn-ghost btn-sm" onClick={onClose}>{t('plan.close')}</button>
              <button className="btn btn-primary btn-sm" onClick={() => void ctrl.apply()}>
                {t('plan.retry')}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="modal-backdrop bg-black/60" onClick={() => setConfirmOpen(false)} />
          <div className="modal-box relative max-w-md rounded-2xl p-6 shadow-2xl" role="alertdialog" aria-modal="true">
            <h3 className="text-base font-bold">{t('plan.trashWarnTitle')}</h3>
            <p className="py-3 text-sm opacity-90">{t('plan.trashWarnBody', { n: trashArmed })}</p>
            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmOpen(false)}>
                {t('plan.cancel')}
              </button>
              <button
                className="btn btn-error btn-sm"
                onClick={() => {
                  setConfirmOpen(false)
                  void ctrl.apply()
                }}
              >
                {t('plan.confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
