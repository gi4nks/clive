import { useTranslation } from 'react-i18next'
import { railLabel } from './resize'
import type { PaneId } from './FilePane'
import { UiIcon } from './UiIcons'

/**
 * A thin vertical rail shown in place of a collapsed dual-pane. Clicking or
 * pressing Enter/Space expands the pane. Uses `base-content` so it's visible
 * in both light and dark themes.
 */
export function PaneRail({
  id,
  path,
  home,
  active,
  onExpand,
}: {
  id: PaneId
  path: string
  home: string
  active: boolean
  onExpand: (id: PaneId) => void
}) {
  const { t } = useTranslation()
  const label = railLabel(path, home)
  const chevron = id === 'left' ? 'chevronRight' : 'chevronLeft'
  return (
    <button
      type="button"
      aria-label={`${t('pane.expand')}: ${label}`}
      title={`${label} — ${t('pane.expand')}`}
      data-tip={`${label} — ${t('pane.expand')}`}
      onClick={() => onExpand(id)}
      className={`tooltip tooltip-right group relative flex w-9 shrink-0 cursor-pointer select-none items-center justify-center border-r border-base-300 bg-base-200/60 text-[10px] uppercase tracking-wider text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${active ? 'bg-base-200 ring-1 ring-inset ring-primary/40' : ''}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1.5 flex justify-center text-base-content/80"
      >
        <UiIcon name={chevron} className="h-3.5 w-3.5" />
      </span>
      <span
        aria-hidden
        className="pointer-events-none truncate"
        style={{ writingMode: 'vertical-rl', maxWidth: 22, maxHeight: '80%', textOverflow: 'ellipsis' }}
      >
        {label}
      </span>
    </button>
  )
}
