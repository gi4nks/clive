import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { usePlan } from './usePlan.js'
import type { Plan, PlanOp } from './plan.js'
import type { FileEntry } from '../api.js'
import { FileIcon } from '../FileIcon.js'
import { addDebugEvent } from './usePlanDebug.js'

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
    if (phase === 'idle' || !plan?.debugId) return
    addDebugEvent(plan.debugId, { stage: 'ui', type: 'state', detail: 'plan-panel-mounted', metadata: { phase, ops: plan.ops.length } })
    return () => addDebugEvent(plan.debugId!, { stage: 'ui', type: 'state', detail: 'plan-panel-unmounted', metadata: { phase } })
  }, [plan?.debugId])

  useEffect(() => {
    if (phase === 'idle' || !plan?.debugId) return
    addDebugEvent(plan.debugId, { stage: 'ui', type: 'state', detail: 'plan-phase', metadata: { phase } })
  }, [phase, plan?.debugId])

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
    if (plan.debugId) addDebugEvent(plan.debugId, { stage: 'ui', type: 'click', detail: 'backdrop' })
    if (phase === 'applying') return
    if (confirmOpen) {
      setConfirmOpen(false)
      return
    }
    onClose()
  }
  const startApply = () => {
    if (plan.debugId) addDebugEvent(plan.debugId, { stage: 'ui', type: 'click', detail: 'apply-button', metadata: { trashArmed } })
    if (trashArmed > 0) setConfirmOpen(true)
    else void ctrl.apply()
  }

  const folders = plan.ops.filter((o) => o.kind === 'createFolder')
  const renderMoveSelect = (op: PlanOp & { kind: 'move' }) => (
    <label className="flex min-w-0 items-center gap-2 text-xs opacity-80 sm:ml-auto">
      <span className="shrink-0">{t('plan.reassign')}</span>
      <select
        className="select select-bordered select-sm min-w-0 max-w-full flex-1 sm:w-44 sm:flex-none"
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
        <div key={op.id} className="grid grid-cols-[auto_1fr] gap-x-2 rounded-lg px-2 py-2 hover:bg-base-200/60" style={pad}>
          <div className="row-span-2 flex items-start pt-1"><OpCheckbox op={op} onToggle={ctrl.toggleOp} /></div>
          <div className="flex min-w-0 items-center gap-2">
            <FileIcon entry={fakeEntry(op.path, false)} />
            <span className="min-w-0 truncate font-medium">{baseOf(op.path)}</span>
            {badge}
          </div>
          <div className="col-start-2 flex min-w-0 items-center gap-2 text-xs text-base-content/60">
            <span className="shrink-0">→</span>
            <span className="min-w-0 truncate">{rel(op.destDir)}/</span>
            {renderMoveSelect(op)}
          </div>
        </div>
      )
    }
    if (op.kind === 'rename') {
      return (
        <div key={op.id} className="grid grid-cols-[auto_1fr] gap-x-2 rounded-lg px-2 py-2 hover:bg-base-200/60" style={pad}>
          <div className="row-span-2 flex items-start pt-1"><OpCheckbox op={op} onToggle={ctrl.toggleOp} /></div>
          <div className="flex min-w-0 items-center gap-2">
            <FileIcon entry={fakeEntry(op.path, false)} />
            <span className="min-w-0 truncate font-medium">{baseOf(op.path)}</span>
            {badge}
          </div>
          <div className="col-start-2 flex min-w-0 items-center gap-2 pt-1 text-xs text-base-content/60">
            <span className="shrink-0">→</span>
            <input
              type="text"
              className="input input-bordered input-sm min-w-0 max-w-full flex-1"
              value={op.newName}
              disabled={!!op.issue}
              onChange={(e) => ctrl.updateOp(op.id, { newName: e.target.value })}
            />
          </div>
        </div>
      )
    }
    if (op.kind === 'trash') {
      return (
        <div key={op.id} className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 hover:bg-base-200/60" style={pad}>
          <OpCheckbox op={op} onToggle={ctrl.toggleOp} />
          <FileIcon entry={fakeEntry(op.path, false)} />
          <span className="min-w-0 truncate font-medium">{baseOf(op.path)}</span>
          <span className="badge badge-error badge-outline badge-sm shrink-0">{t('plan.trash')}</span>
          {badge}
        </div>
      )
    }
    return null
  }

  const renderNode = (node: TreeNode, depth: number) => (
    <div key={node.path} className={depth === 0 ? 'space-y-1' : 'ml-3 border-l border-base-300 pl-2'}>
      <div className="flex min-w-0 items-center gap-2 rounded-lg bg-base-200/50 px-3 py-2" style={{ marginLeft: depth === 0 ? 0 : 0 }}>
        {node.createOp ? (
          <OpCheckbox op={node.createOp} onToggle={ctrl.toggleOp} />
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <FileIcon entry={fakeEntry(node.path, true)} />
        {node.createOp && !node.createOp.issue ? (
          <input
            type="text"
            className="input input-bordered input-sm min-w-0 max-w-[15rem] flex-1"
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
      <div className="space-y-0.5">{node.items.map((op) => renderOp(op, depth + 1))}</div>
      <div className="space-y-1">{node.children.map((ch) => renderNode(ch, depth + 1))}</div>
    </div>
  )

  const tree = buildPlanTree(plan)
  const locked = phase === 'applying'
  const activeReport = phase === 'undone' ? undoReport : report

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" data-plan-panel>
      <div className="absolute inset-0 bg-black/40" onClick={onBackdrop} aria-hidden="true" />
      <div
        data-testid="plan-panel-dialog"
        className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-base-100 p-0 shadow-2xl opacity-100"
        role="dialog"
        aria-modal="true"
      >
        <div className="border-b border-base-300 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-xl font-bold">{t('plan.title')}</h3>
              <div className="mt-1 truncate text-sm text-base-content/60" title={plan.rootPath}>{plan.rootPath}</div>
            </div>
            <button className="tooltip tooltip-bottom btn btn-circle btn-ghost btn-sm shrink-0" disabled={phase === 'applying'} onClick={onClose} aria-label={t('plan.close')}
              title={t('plan.close')}
        data-tip={t('plan.close')}>
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ['createFolder', t('plan.create')],
              ['move', t('plan.move')],
              ['rename', t('plan.rename')],
              ['trash', t('plan.trash')],
            ].map(([kind, label]) => (
              <div key={kind} className="rounded-lg bg-base-200/60 px-3 py-2">
                <div className="text-lg font-semibold leading-none">{numOps(kind as PlanOp['kind'])}</div>
                <div className="mt-1 truncate text-xs text-base-content/60">{label}</div>
              </div>
            ))}
            <div className="rounded-lg bg-base-200/60 px-3 py-2">
              <div className="text-lg font-semibold leading-none">{plan.unchanged.length}</div>
              <div className="mt-1 truncate text-xs text-base-content/60">{t('plan.untouched')}</div>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6">
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
            <div className="space-y-2">{renderNode(tree, 0)}</div>
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
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmOpen(false)} aria-hidden="true" />
          <div className="relative z-10 max-w-md rounded-2xl bg-base-100 p-6 shadow-2xl" role="alertdialog" aria-modal="true">
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
