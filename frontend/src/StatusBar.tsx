import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Popover } from './Popover'
import { WIDGETS } from './statusWidgets'
import type { Placement, Widget, WidgetCtx } from './widgetTypes'
import { ErrorBoundary } from './ErrorBoundary'

const NARROW_THRESHOLD = 880

function groupSorted(placement: Placement, ctx: WidgetCtx): Widget[] {
  return WIDGETS.filter((w) => w.placement === placement)
    .filter((w) => (w.visible ? w.visible(ctx) : true))
    .sort((a, b) => a.order - b.order)
}

export function StatusBar({ ctx, chatOpen = false, onChat }: { ctx: WidgetCtx; chatOpen?: boolean; onChat?: () => void }) {
  const { t } = useTranslation()
  const barRef = useRef<HTMLDivElement>(null)
  const [narrow, setNarrow] = useState(false)
  const [ovOpen, setOvOpen] = useState(false)

  useEffect(() => {
    const el = barRef.current
    if (!el) return
    const measure = () => setNarrow(el.clientWidth < NARROW_THRESHOLD)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const left = useMemo(() => groupSorted('left', ctx), [ctx])
  const center = useMemo(() => groupSorted('center', ctx), [ctx])
  const right = useMemo(() => groupSorted('right', ctx), [ctx])

  const renderOne = (w: Widget) => {
    const C = w.Component
    return (
      <ErrorBoundary key={w.id} name={w.id}>
        <C ctx={ctx} />
      </ErrorBoundary>
    )
  }

  const overflowable = narrow ? right.filter((w) => w.collapsible) : []
  const rightVisible = narrow ? right.filter((w) => !w.collapsible) : right

  return (
    <div
      ref={barRef}
      data-status-bar className="flex h-8 shrink-0 select-none items-center gap-1 border-t border-base-300 bg-base-200 px-2 text-xs text-base-content/80"
    >
      {/* left */}
      <div className="flex shrink-0 items-center gap-1">{left.map(renderOne)}</div>

      {/* center */}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        {center.map(renderOne)}
      </div>

      {/* right */}
      <div className="flex shrink-0 items-center gap-0.5">
        {onChat && (
          <button
            data-bar-control
            className={`tooltip tooltip-top btn btn-ghost btn-xs !min-h-0 h-5 px-1 leading-none ${chatOpen ? 'btn-active' : ''}`}
            title={t('chat.title')}
        data-tip={t('chat.title')}
            aria-label={t('chat.title')}
            aria-pressed={chatOpen}
            onClick={onChat}
          >
            💬
          </button>
        )}
        {overflowable.length > 0 && (
          <Popover
            align="right"
            open={ovOpen}
            onOpenChange={setOvOpen}
            buttonTitle={t('overflow.system')}
            panelClassName="w-72"
            label="⋯"
          >
            <div className="flex flex-col gap-1">{overflowable.map(renderOne)}</div>
          </Popover>
        )}
        {rightVisible.map(renderOne)}
      </div>
    </div>
  )
}
