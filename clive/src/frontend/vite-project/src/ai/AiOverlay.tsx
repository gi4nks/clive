import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AiController } from './useAi'
import { basename } from './safety'

/**
 * Global AI preview/apply surface. Because it is owned by App (not the popover),
 * it renders whether an AI action was started from the status-bar panel or the
 * right-click context menu. Shows the in-flight state, the summary output, and
 * the editable rename/organize/generate previews with Apply/Cancel, plus Undo.
 */
export function AiOverlay({ ai }: { ai: AiController }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const { busy, hasPreview, summary, rows, organize, gen, journal, error } = ai
  if (!busy && !hasPreview && !journal && !error) return null

  return (
    <div className="fixed bottom-9 right-2 z-50 flex max-h-[65vh] w-96 flex-col gap-2 rounded-box border border-base-300 bg-base-100 p-3 text-base-content shadow-xl">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {busy && busy !== 'apply' && <span className="loading loading-spinner loading-xs" />}
          {busy ? t('ai.processing') : t('ai.result')}
        </span>
        <button data-bar-control className="tooltip tooltip-left btn btn-ghost btn-xs" title={t('common.close')}
        data-tip={t('common.close')} onClick={() => (busy ? ai.abort() : ai.cancel())}>
          ✕
        </button>
      </div>

      {busy && !hasPreview && !error && <div className="text-xs text-base-content/60">{t('ai.waiting')}</div>}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-error/40 bg-error/10 p-2 text-xs text-error">
          <span aria-hidden>⚠️</span>
          <span className="min-w-0 flex-1 break-words">{error}</span>
          <button data-bar-control className={`btn btn-ghost btn-xs shrink-0 ${copied ? 'text-success' : ''} !min-h-0`} onClick={async () => {
            try {
              await navigator.clipboard.writeText(error)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            } catch {
              /* clipboard failed silently */
            }
          }}>
            {copied ? 'Copiato!' : t('ai.copy')}
            <span className="ml-1 text-xs opacity-80">↻</span>
          </button>
          <button data-bar-control className="tooltip tooltip-left btn btn-ghost btn-xs shrink-0 !min-h-0" aria-label={t('common.close')}
              title={t('common.close')}
        data-tip={t('common.close')} onClick={ai.cancel}>✕</button>
        </div>
      )}

      {summary && <div className="max-h-52 overflow-y-auto rounded-md border border-base-300 bg-base-200 p-2 text-xs whitespace-pre-wrap">{summary}</div>}

      {gen && (
        <div className="flex flex-col gap-1">
          <input data-bar-control value={gen.name} onChange={(e) => ai.setGen({ ...gen, name: e.target.value })} className="input input-sm input-bordered h-8" />
          <textarea data-bar-control value={gen.body} onChange={(e) => ai.setGen({ ...gen, body: e.target.value })} rows={6} className="textarea textarea-bordered text-xs" />
        </div>
      )}

      {rows && (
        <div className="max-h-52 overflow-y-auto">
          <div className="mb-1 text-xs font-medium">{t('ai.renamePreview')}</div>
          {rows.map((r, i) => (
            <div key={r.path} className="flex items-center gap-1 py-0.5">
              <span className="w-24 shrink-0 truncate text-[11px] text-base-content/60" title={r.from}>{r.from}</span>
              <span className="text-[11px] text-base-content/40">→</span>
              <input
                data-bar-control
                value={r.to}
                disabled={!r.ok}
                onChange={(e) => ai.setRows(rows.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))}
                className="input input-xs input-bordered h-6 min-w-0 flex-1"
              />
              {!r.ok && <span className="text-[10px] text-error" title={r.error}>!</span>}
            </div>
          ))}
        </div>
      )}

      {organize && (
        <div className="max-h-52 overflow-y-auto">
          <div className="mb-1 text-xs font-medium">
            {t('ai.organizePreview', { files: organize.moves.length, folders: organize.folders.length })}
          </div>
          {organize.moves.map((m) => (
            <label key={m.src} className="flex items-center gap-1 py-0.5 text-[11px]">
              <input type="checkbox" className="checkbox checkbox-xs" checked={!ai.excluded.has(m.src)} onChange={() => ai.toggleExcluded(m.src)} />
              <span className="truncate">{basename(m.src)}</span>
              <span className="text-base-content/40">→</span>
              <span className="truncate text-info">{m.dstFolder || t('ai.root')}</span>
            </label>
          ))}
          {organize.unknown.length > 0 && <div className="text-[10px] text-warning">{t('ai.unknownSkipped', { count: organize.unknown.length })}</div>}
        </div>
      )}

      <div className="flex items-center justify-end gap-1">
        {journal && (
          <button data-bar-control className="btn btn-ghost btn-xs text-info" onClick={() => void ai.undo()}>
            {t('ai.undoChanges')}
          </button>
        )}
{hasPreview && (
    <>
      <button data-bar-control className="btn btn-ghost btn-xs" onClick={ai.cancel}>{t('common.cancel')}</button>
      <button data-bar-control className={`btn btn-primary btn-xs ${busy === 'summarize' ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={busy !== null} onClick={() => ai.busy === 'summarize' ? ai.cancel() : ai.apply()}>
        {busy === 'apply' ? '…' : t('common.apply')}
      </button>
    </>
  )}
      </div>
    </div>
  )
}
