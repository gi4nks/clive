import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Popover } from '../Popover'
import type { WidgetCtx } from '../widgetTypes'
import { isCloudProvider, providerLabel } from './settings'

const iconSpark = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
  </svg>
)

/**
 * Status-bar AI control panel. All state and the run/preview/apply/undo flow
 * live in the shared controller (`ctx.ai`, see `useAi`); previews render in the
 * global `AiOverlay`. Kept thin so the context menu can trigger the same actions.
 */
export function AiWidget({ ctx }: { ctx: WidgetCtx }) {
  const { t } = useTranslation()
  const ai = ctx.ai
  const [open, setOpen] = useState(false)
  const [genPrompt, setGenPrompt] = useState('')

  const offline = ai.offline
  const noSel = ctx.selectedEntries.length === 0
  const running = ai.busy !== null && ai.busy !== 'apply'
  const act = (fn: () => void) => (running ? ai.abort() : fn())

  return (
    <Popover
      align="right"
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o && !ai.health) void ai.refresh()
        else if (!o && running) ai.abort()
      }}
      buttonTitle={t('ai.title')}
      panelClassName="w-80"
      label={iconSpark}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{t('ai.title')}</span>
          <span className={`badge badge-sm ${ai.providerOk ? 'badge-success' : ai.gatewayDown ? 'badge-error' : ai.health ? 'badge-warning' : 'badge-ghost'}`}>
            {ai.providerOk ? t('ai.online') : ai.gatewayDown ? t('ai.offline') : ai.health ? t('ai.providerDown') : '…'}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-base-content/60">
          <span className="truncate">
            <span className="text-base-content/40">{t('ai.model')}: </span>
            <span className="font-medium text-base-content">
              {providerLabel(ai.sel.provider)} · {ai.sel.model}
            </span>
          </span>
          <button data-bar-control className="tooltip tooltip-top btn btn-ghost btn-xs shrink-0" title={t('common.refresh')}
        data-tip={t('common.refresh')} onClick={() => void ai.refresh()}>
            ⟳
          </button>
        </div>

        {offline && <div className="text-xs text-error">{ai.health ? t('ai.providerUnreachable') : t('ai.checking')}</div>}

        {isCloudProvider(ai.sel.provider) && ai.sel.provider && <div className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] text-warning">{t('ai.cloudWarn')}</div>}

        <div className="grid grid-cols-2 gap-1">
          <button data-bar-control className="btn btn-sm btn-primary" disabled={offline || ai.busy !== null || noSel} onClick={() => act(() => ai.requestRename(ctx.selectedEntries))}>
            {ai.busy === 'rename' ? t('common.cancel') : t('ai.rename')}
          </button>
          <button data-bar-control className="btn btn-sm btn-outline" disabled={offline || ai.busy !== null || noSel} onClick={() => act(() => ai.requestOrganize(ctx.selectedEntries))}>
            {ai.busy === 'organize' ? t('common.cancel') : t('ai.organize')}
          </button>
          <button data-bar-control className="btn btn-sm btn-outline" disabled={offline || ai.busy !== null || noSel} onClick={() => act(() => ai.requestSummarize(ctx.selectedEntries))}>
            {ai.busy === 'summarize' ? t('common.cancel') : t('ai.summarize')}
          </button>
          <button data-bar-control className="btn btn-sm btn-outline" disabled={offline || ai.busy !== null} onClick={() => act(() => ai.requestGenerate(genPrompt))}>
            {ai.busy === 'generate' ? t('common.cancel') : t('ai.generate')}
          </button>
        </div>

        {ai.busy !== 'generate' && (
          <input
            data-bar-control
            value={genPrompt}
            onChange={(e) => setGenPrompt(e.target.value)}
            placeholder={t('ai.generatePlaceholder')}
            className="input input-xs input-bordered h-7"
          />
        )}
      </div>
    </Popover>
  )
}
