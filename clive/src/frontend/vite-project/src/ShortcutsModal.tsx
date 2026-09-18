/**
 * Keyboard shortcuts overlay (⌘/): a static, localized map of every binding.
 * The list is the source of truth shown to the user; keep it in sync with the
 * App key handler when adding shortcuts.
 */
import { useTranslation } from 'react-i18next'

interface Row {
  keys: string[]
  labelKey: string
}

const GROUPS: { titleKey: string; rows: Row[] }[] = [
  {
    titleKey: 'shortcuts.gNavigation',
    rows: [
      { keys: ['⌘', '←'], labelKey: 'toolbar.back' },
      { keys: ['⌘', '→'], labelKey: 'toolbar.forward' },
      { keys: ['⌘', '↑'], labelKey: 'toolbar.up' },
      { keys: ['⌘', 'D'], labelKey: 'shortcuts.goUp' },
      { keys: ['⌘', 'L'], labelKey: 'shortcuts.editPath' },
      { keys: ['⌘', 'R'], labelKey: 'toolbar.refresh' },
      { keys: ['⌘', 'B'], labelKey: 'shortcuts.toggleSidebar' },
    ],
  },
  {
    titleKey: 'shortcuts.gPanes',
    rows: [
      { keys: ['⌘', '1'], labelKey: 'shortcuts.paneLeft' },
      { keys: ['⌘', '2'], labelKey: 'shortcuts.paneRight' },
      { keys: ['Tab'], labelKey: 'shortcuts.switchPane' },
      { keys: ['⌘', '\\'], labelKey: 'shortcuts.focusMode' },
      { keys: ['⌘', '⌥', '←'], labelKey: 'shortcuts.swapPanes' },
      { keys: ['⌘', '⇧', 'P'], labelKey: 'toolbar.preview' },
    ],
  },
  {
    titleKey: 'shortcuts.gSelection',
    rows: [
      { keys: ['↑', '↓'], labelKey: 'shortcuts.moveSelection' },
      { keys: ['⌘', 'A'], labelKey: 'shortcuts.selectAll' },
      { keys: ['⇧', '↑/↓'], labelKey: 'shortcuts.extendSelection' },
      { keys: ['⌘/Ctrl', 'Clic'], labelKey: 'shortcuts.toggleAdd' },
      { keys: ['⇧', 'Clic'], labelKey: 'shortcuts.rangeSelect' },
      { keys: ['drag'], labelKey: 'shortcuts.marquee' },
      { keys: ['⌫', 'Canc'], labelKey: 'shortcuts.trash' },
      { keys: ['Esc'], labelKey: 'shortcuts.clear' },
    ],
  },
  {
    titleKey: 'shortcuts.gActions',
    rows: [
      { keys: ['⏎'], labelKey: 'shortcuts.openItem' },
      { keys: ['Spazio'], labelKey: 'shortcuts.quickLook' },
      { keys: ['⌘', 'C'], labelKey: 'toolbar.copy' },
      { keys: ['⌘', 'X'], labelKey: 'toolbar.cut' },
      { keys: ['⌘', 'V'], labelKey: 'toolbar.paste' },
      { keys: ['⌘', '⇧', 'O'], labelKey: 'shortcuts.sendToOther' },
      { keys: ['⌘', 'N'], labelKey: 'shortcuts.newFolder' },
      { keys: ['⌘', '⇧', 'C'], labelKey: 'chat.title' },
    ],
  },
]

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  if (!open) return null
  return (
    <div className="modal modal-open z-[80]" role="dialog" aria-modal="true" aria-label={t('shortcuts.title')}>
      <div className="modal-box max-h-[80vh] w-full max-w-2xl rounded-2xl p-0 shadow-2xl">
        <div className="flex items-center justify-between border-b border-base-300 px-5 py-3">
          <h3 className="text-base font-semibold">{t('shortcuts.title')}</h3>
          <button
            className="tooltip tooltip-bottom btn btn-ghost btn-sm btn-circle"
            onClick={onClose}
            aria-label={t('common.close')}
            title={t('common.close')}
            data-tip={t('common.close')}
          >
            ✕
          </button>
        </div>
        <div className="grid gap-x-8 gap-y-4 overflow-y-auto p-5 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g.titleKey}>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-60">{t(g.titleKey)}</div>
              <ul className="space-y-1">
                {g.rows.map((r) => (
                  <li key={r.labelKey + r.keys.join()} className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate opacity-80">{t(r.labelKey)}</span>
                    <span className="flex shrink-0 gap-1">
                      {r.keys.map((k) => (
                        <kbd key={k} className="kbd kbd-xs font-mono">{k}</kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="modal-backdrop bg-black/40" onClick={onClose} />
    </div>
  )
}
