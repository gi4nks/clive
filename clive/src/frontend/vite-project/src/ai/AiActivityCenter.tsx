import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { usePlanDebug, type PlanDebugLog } from './usePlanDebug.js'

export interface AiActivityCenterProps {
  open: boolean
  onClose: () => void
  onOpenTechnical: () => void
  planBusy: boolean
  planElapsed: number
  planPhase: string
  planNotice?: string
}

const statusClass = (status: PlanDebugLog['status']) => ({
  success: 'text-success',
  error: 'text-error',
  empty: 'text-warning',
  pending: 'text-info',
}[status])

export function AiActivityCenter({ open, onClose, onOpenTechnical, planBusy, planElapsed, planPhase, planNotice }: AiActivityCenterProps) {
  const { t } = useTranslation()
  const { logs, subscribe } = usePlanDebug()
  useEffect(() => subscribe(), [subscribe])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const phaseLabel = (phase: string) => t(`activity.phase.${phase}`, { defaultValue: phase })

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <button type="button" aria-label={t('activity.close')}
              className="absolute inset-0 border-0 bg-black/35" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-base-300 bg-base-100 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="activity-title">
        <header className="flex items-center justify-between border-b border-base-300 px-4 py-3">
          <div>
            <h2 id="activity-title" className="text-sm font-semibold">{t('activity.title')}</h2>
            <p className="text-[11px] opacity-60">{t('activity.subtitle')}</p>
          </div>
          <button type="button" className="tooltip tooltip-left btn btn-ghost btn-xs" onClick={onClose} aria-label={t('common.close')}
              title={t('common.close')}
        data-tip={t('common.close')}>✕</button>
        </header>

        {planBusy && (
          <section className="border-b border-primary/20 bg-primary/5 px-4 py-4">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span>{phaseLabel(planPhase || 'stream')}</span>
              <span className="font-mono opacity-70">{planElapsed}s</span>
            </div>
            <progress className="progress progress-primary mt-2 w-full" value={Math.min(planElapsed, 300)} max="300" />
            <p className="mt-2 text-[11px] opacity-70">{t('activity.runningHint')}</p>
          </section>
        )}

        {planNotice && (
          <section className="mx-4 mt-3 rounded-lg border border-error/30 bg-error/10 p-3 text-xs text-error">{planNotice}</section>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide opacity-50">{t('activity.recentRuns')}</div>
          {logs.length === 0 ? (
            <p className="py-8 text-center text-xs opacity-50">{t('activity.noRuns')}</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="rounded-lg border border-base-300 bg-base-200/40 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-semibold ${statusClass(log.status)}`}>{log.status === 'pending' ? t('activity.running') : t(`activity.status.${log.status}`, { defaultValue: log.status })}</span>
                    <span className="font-mono text-[10px] opacity-50">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="mt-1 truncate font-medium">{log.kind === 'chat' ? t('activity.chat') : t('activity.plan')} · {phaseLabel(log.stage ?? 'health')} · {log.model}</div>
                  <div className="mt-1 flex items-center justify-between text-[11px] opacity-60">
                    <span>{log.expandedOpsCount !== undefined ? t('activity.operations', { count: log.expandedOpsCount }) : log.errorDetails ?? t('activity.waiting')}</span>
                    <span>{t('activity.events', { count: log.events?.length ?? 0 })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-base-300 px-4 py-3">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenTechnical}>{t('activity.technical')}</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>{t('common.close')}</button>
        </footer>
      </aside>
    </div>
  )
}
