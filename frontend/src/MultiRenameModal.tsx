/**
 * Multi-rename review modal (feature "rinomina multipla con pattern").
 * Pattern tokens expand in display order; every row can be edited by hand or
 * excluded. Apply is explicit and runs through the shared rename pipeline
 * (validated in Rust, undoable via the journal).
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FileEntry } from './api'
import { computeRows, type PatternOptions } from './renamePattern'

interface Props {
  open: boolean
  entries: FileEntry[]
  onClose: () => void
  onApply: (renames: { path: string; newName: string }[]) => void
}

export function MultiRenameModal({ open, entries, onClose, onApply }: Props) {
  const { t } = useTranslation()
  const [pattern, setPattern] = useState('{name}.{ext}')
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [useRegex, setUseRegex] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  const opts: PatternOptions = useMemo(
    () => ({ pattern, find, replace, useRegex, startIndex: 1 }),
    [pattern, find, replace, useRegex],
  )

  const rows = useMemo(() => {
    const base = computeRows(
      entries.map((e) => ({ name: e.name, isDir: e.isDir, modified: e.modified, path: e.path })),
      opts,
    )
    return base.map((r) => {
      const target = overrides[r.path] ?? r.target
      if (target === r.target) return r
      const clash = base.some((o) => o.path !== r.path && (overrides[o.path] ?? o.target) === target)
      const valid = target.length > 0 && !target.includes('/')
      return { ...r, target, ok: valid && !clash, reason: clash ? ('dup' as const) : valid ? undefined : ('invalid' as const) }
    })
  }, [entries, opts, overrides])

  if (!open) return null

  const applicable = rows.filter((r) => r.ok && !excluded.has(r.path) && overrides[r.path] !== r.source && r.target !== (entries.find((e) => e.path === r.path)?.name ?? ''))
  const apply = () => {
    const picked = rows.filter((r) => r.ok && !excluded.has(r.path)).map((r) => ({ path: r.path, newName: r.target }))
    const changed = picked.filter((p) => entries.find((e) => e.path === p.path)?.name !== p.newName)
    if (changed.length) onApply(changed)
  }
  const reasonLabel = (reason?: string) =>
    reason === 'dup' ? t('rename.dup') : reason === 'invalid' ? t('rename.invalid') : reason === 'regex' ? t('rename.regex') : ''

  return (
    <div className="modal modal-open z-[90]" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onClose())}>
      <div className="modal-box flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl p-0 shadow-2xl" role="dialog" aria-modal="true" aria-label={t('rename.title')}>
        <div className="flex items-center justify-between border-b border-base-300 px-5 py-3">
          <h3 className="text-base font-semibold">{t('rename.title')} <span className="ms-1 text-xs font-normal opacity-60">({entries.length})</span></h3>
          <button data-bar-control className="btn btn-ghost btn-sm btn-circle" onClick={onClose} aria-label={t('common.close')} title={t('common.close')}>✕</button>
        </div>

        <div className="shrink-0 space-y-2 border-b border-base-300 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] uppercase tracking-wide opacity-60">{t('rename.pattern')}</label>
            <input data-bar-control autoFocus className="input input-sm input-bordered min-w-0 flex-1 font-mono" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="IMG_{n>3}_{date:YYYYMMDD}.{ext}" />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input data-bar-control className="input input-xs input-bordered w-40 font-mono" value={find} onChange={(e) => setFind(e.target.value)} placeholder={t('rename.find')} />
            <input data-bar-control className="input input-xs input-bordered w-40 font-mono" value={replace} onChange={(e) => setReplace(e.target.value)} placeholder={t('rename.replace')} />
            <label data-bar-control className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" className="checkbox checkbox-xs" checked={useRegex} onChange={(e) => setUseRegex(e.target.checked)} />
              {t('rename.regexMode')}
            </label>
            <span className="ms-auto opacity-60">{t('rename.hint')}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
          <table className="table table-sm">
            <thead>
              <tr className="text-[10px] uppercase opacity-60">
                <th className="w-8"></th>
                <th>{t('rename.current')}</th>
                <th>{t('rename.new')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.path} className={r.ok ? '' : 'text-error'}>
                  <td>
                    <input
                      data-bar-control
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      checked={!excluded.has(r.path)}
                      onChange={() => setExcluded((prev) => {
                        const n = new Set(prev)
                        if (n.has(r.path)) n.delete(r.path)
                        else n.add(r.path)
                        return n
                      })}
                    />
                  </td>
                  <td className="max-w-[16rem] truncate opacity-70" title={r.source}>{r.source}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <input
                        data-bar-control
                        className={`input input-xs input-bordered min-w-0 flex-1 font-mono ${r.ok ? '' : 'input-error'}`}
                        value={r.target}
                        onChange={(e) => setOverrides((s) => ({ ...s, [r.path]: e.target.value }))}
                      />
                      {r.reason && <span className="shrink-0 text-[10px]">{reasonLabel(r.reason)}</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-base-300 px-5 py-3">
          <span className="me-auto text-xs opacity-60">{t('rename.count', { n: applicable.length })}</span>
          <button data-bar-control className="btn btn-sm btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button data-bar-control className="btn btn-sm btn-primary" disabled={!applicable.length} onClick={apply}>{t('rename.apply')}</button>
        </div>
      </div>
      <div className="modal-backdrop bg-black/40" onClick={onClose} />
    </div>
  )
}
