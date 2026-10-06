import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  mode: 'copy' | 'move'
  count: number
  home: string
  recents: string[]
  currentPath: string
  otherPanePath?: string
  onClose: () => void
  onConfirm: (dstDir: string) => void
}

export function TransferPicker({ open, mode, count, home, recents, currentPath, otherPanePath, onClose, onConfirm }: Props) {
  const { t } = useTranslation()
  const [custom, setCustom] = useState('')
  if (!open) return null

  const places = [
    { label: t('places.current'), path: currentPath },
    { label: t('places.home'), path: home },
    ...(home
      ? [
          { label: t('places.desktop'), path: `${home}/Desktop` },
          { label: t('places.documents'), path: `${home}/Documents` },
          { label: t('places.downloads'), path: `${home}/Downloads` },
          { label: t('places.pictures'), path: `${home}/Pictures` },
          { label: t('places.music'), path: `${home}/Music` },
        ]
      : []),
  ]
  const recentTargets = recents.filter((r) => r !== currentPath)

  const Option = ({ label, path }: { label: string; path: string }) => (
    <li>
      <button
        className="w-full text-left"
        onClick={() => onConfirm(path)}
        title={path}
      >
        <span className="truncate">{label}</span>
        <span className="ml-2 truncate text-[11px] text-base-content/40">{path}</span>
      </button>
    </li>
  )

  return (
    <div className="modal modal-open">
      <div className="modal-box w-full max-w-md rounded-2xl">
        <h3 className="mb-1 text-base font-semibold">
          {mode === 'copy' ? t('transfer.copyToTitle') : t('transfer.moveToTitle')}
        </h3>
        <p className="mb-3 text-xs text-base-content/60">
          {t('transfer.count', { count })}
        </p>

        <ul className="menu menu-sm max-h-56 overflow-y-auto rounded-lg border border-base-300">
          {otherPanePath && otherPanePath !== currentPath && (
            <>
              <li className="menu-title px-2 text-[10px] uppercase tracking-wide opacity-60">{t('transfer.otherPane')}</li>
              <Option label={(otherPanePath.split('/').filter(Boolean).slice(-1)[0] || otherPanePath) as string} path={otherPanePath} />
            </>
          )}
          {places.map((p) => (
            <Option key={p.path} label={p.label} path={p.path} />
          ))}
          {recentTargets.length > 0 && (
            <li className="menu-title mt-1 px-2 text-[10px] uppercase tracking-wide opacity-60">{t('places.recents')}</li>
          )}
          {recentTargets.map((r) => (
            <Option key={r} label={(r.split('/').pop() || r) as string} path={r} />
          ))}
        </ul>

        <div className="mt-3 flex gap-2">
          <input
            autoFocus
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && custom.trim()) onConfirm(custom.trim())
              if (e.key === 'Escape') onClose()
            }}
            placeholder={t('transfer.customPlaceholder')}
            className="input input-sm input-bordered min-w-0 flex-1"
          />
          <button className="btn btn-sm btn-primary" disabled={!custom.trim()} onClick={() => onConfirm(custom.trim())}>
            {t('transfer.go')}
          </button>
        </div>

        <div className="modal-action">
          <button className="btn btn-sm" onClick={onClose}>{t('common.cancel')}</button>
        </div>
      </div>
      <div className="modal-backdrop bg-black/40" onClick={onClose} />
    </div>
  )
}
