import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { diskSpace, openPath, formatSize, formatDate, revealInFinder, trashList, trashRestore, trashDeleteForever, trashEmpty, emptyTrash, type DiskSpace, type TrashItem } from './api'
import type { MenuItem } from './ContextMenu'
import { Popover } from './Popover'
import type { WidgetCtx } from './widgetTypes'
import { useVolumes } from './volumes'
import { splitArchivePath } from './archivePath'

/** basename for a path (no fs access). */
const basenameOf = (p: string): string => p.replace(/\/+$/, '').split('/').pop() || p

/* ---------- tiny inline icons ---------- */
function Wi({ d, fill = false }: { d: string; fill?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  )
}
const iconClock = <Wi d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM12 8v4l3 2" />
const iconCalendar = <Wi d="M4 5h16v15H4zM4 9h16M8 3v3M16 3v3" />
const iconDisk = <Wi d="M4 6h16v12H4zM7 15h.01M4 12h16" />
const iconTrash = <Wi d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
const iconZap = <Wi d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" fill />
const iconSearch = <Wi d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4" />
const iconCopy = <Wi d="M8 8h10v10H8zM6 16H4V6h10v2" />

/* ---------- count (left) ---------- */
export function CountWidget({ ctx }: { ctx: WidgetCtx }) {
  const { t } = useTranslation()
  return (
    <span className="whitespace-nowrap px-1 text-xs text-base-content/70">
      {t('count.elements', { count: ctx.entries.length })}
      {ctx.selectedEntries.length > 0 && (
        <span className="ml-2 text-info">{t('count.selected', { count: ctx.selectedEntries.length })}</span>
      )}
    </span>
  )
}

/* ---------- contextual quick actions (left) ---------- */
function renderMenuRow(it: MenuItem, onFire: (it: MenuItem) => void) {
  if (it.separator) return <li key={it.key} className="my-1 h-px bg-base-300" aria-hidden />
  return (
    <li key={it.key}>
      <button
        data-bar-control
        disabled={it.disabled}
        className={it.danger ? 'text-error' : ''}
        onClick={() => onFire(it)}
      >
        {it.icon}
        <span className="flex-1 text-left">{it.label}</span>
        {it.hint && <span className="ml-3 text-xs opacity-50">{it.hint}</span>}
      </button>
    </li>
  )
}

export function ContextActionsWidget({ ctx }: { ctx: WidgetCtx }) {
  const { t } = useTranslation()
  const [ovOpen, setOvOpen] = useState(false)
  const items = ctx.actionsFor(ctx.selectedEntries)
  const actionable = items.filter((i) => !i.separator && i.onSelect)
  const inline = actionable.slice(0, 3)
  const hasOverflow = actionable.length > inline.length

  return (
    <div className="flex items-center gap-0.5">
      {inline.map((it) => (
        <button
          key={it.key}
          data-bar-control
          disabled={it.disabled}
          title={it.label}
        data-tip={it.label}
          onClick={() => it.onSelect?.()}
          className={`btn btn-ghost btn-xs !h-7 !min-h-0 gap-1 ${it.danger ? 'text-error' : ''}`}
        >
          {it.icon ?? <span className="text-[11px]">{it.label?.[0]}</span>}
        </button>
      ))}
      {hasOverflow && (
        <Popover
          align="left"
          open={ovOpen}
          onOpenChange={setOvOpen}
          buttonTitle={t('overflow.title')}
          label="⋯"
          panelClassName="p-0"
        >
          <ul className="menu menu-sm w-56 p-1">
            {items.map((it) =>
              renderMenuRow(it, (fired) => {
                fired.onSelect?.()
                setOvOpen(false)
              }),
            )}
          </ul>
        </Popover>
      )}
    </div>
  )
}

/* ---------- search (center) ---------- */
export function SearchWidget({ ctx }: { ctx: WidgetCtx }) {
  const { t } = useTranslation()
  return (
    <div className="flex w-full max-w-sm items-center gap-1">
      <span className="text-base-content/40">{iconSearch}</span>
      <input
        data-bar-control
        value={ctx.searchQuery}
        onChange={(e) => ctx.setSearchQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            ctx.setSearchQuery('')
            e.currentTarget.blur()
          }
        }}
        placeholder={t('search.placeholder')}
        className="input input-sm input-bordered h-7 min-w-0 flex-1"
      />
      {ctx.searchQuery && (
        <button
          data-bar-control
          onClick={() => ctx.setSearchQuery('')}
          className="btn btn-ghost btn-xs !h-6 !min-h-0"
          title={t('search.clear')}
        >
          ✕
        </button>
      )}
    </div>
  )
}

/* ---------- clipboard chip (center) ---------- */
export function ClipboardChipWidget({ ctx }: { ctx: WidgetCtx }) {
  const { t } = useTranslation()
  const { clip, pasteInFlight } = ctx
  return (
    <button
      data-bar-control
      onClick={ctx.clearClipboard}
      title={t('chip.clearTitle')}
        data-tip={t('chip.clearTitle')}
      className="tooltip tooltip-top btn btn-soft btn-info btn-xs !h-7 min-w-0 gap-1.5"
    >
      {pasteInFlight ? <span className="loading loading-spinner loading-xs" /> : iconCopy}
      <span className="truncate">
        {clip.paths.length} · {clip.operation === 'move' ? t('chip.move') : t('chip.copy')}
      </span>
    </button>
  )
}

/* ---------- clock (right) ---------- */
export function ClockWidget() {
  const { t, i18n } = useTranslation()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const lang = i18n.language
  return (
    <Popover
      align="right"
      buttonTitle={t('clock.title')}
      panelClassName="w-56"
      label={<>{iconClock}<span className="tabular-nums">{now.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}</span></>}
    >
      <div className="px-1 py-1 text-center">
        <div className="text-3xl font-semibold tabular-nums">{now.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
        <div className="mt-1 text-sm capitalize text-base-content/70">
          {now.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>
    </Popover>
  )
}

/* ---------- calendar, date-only (right) ---------- */
export function CalendarWidget() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const today = useMemo(() => new Date(), [])
  const wd = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(new Date(2024, 0, 1 + i))),
    [lang],
  )
  const cells = useMemo(() => {
    const first = new Date(today.getFullYear(), today.getMonth(), 1)
    const startWeekday = (first.getDay() + 6) % 7
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    const arr: (number | null)[] = Array.from({ length: startWeekday }, () => null)
    for (let d = 1; d <= daysInMonth; d++) arr.push(d)
    return arr
  }, [today])
  return (
    <Popover
      align="right"
      buttonTitle={t('calendar.title')}
      panelClassName="w-64"
      label={<>{iconCalendar}<span>{today.toLocaleDateString(lang, { day: 'numeric', month: 'short' })}</span></>}
    >
      <div className="mb-1 text-center text-sm font-semibold capitalize">
        {today.toLocaleDateString(lang, { month: 'long', year: 'numeric' })}
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
        {wd.map((w, i) => (
          <span key={i} className="py-0.5 text-base-content/50">{w}</span>
        ))}
        {cells.map((d, i) => (
          <span
            key={i}
            className={d === today.getDate() ? 'rounded-md bg-primary font-semibold text-primary-content' : d ? 'rounded-md py-1' : ''}
          >
            {d ?? ''}
          </span>
        ))}
      </div>
    </Popover>
  )
}

/* ---------- disk usage (right) ---------- */
export function DiskWidget({ ctx }: { ctx: WidgetCtx }) {
  const { t } = useTranslation()
  const [data, setData] = useState<DiskSpace | null>(null)
  const vols = useVolumes()
  const realPath = splitArchivePath(ctx.currentPath)?.archive ?? ctx.currentPath
  const load = () => {
    diskSpace(realPath)
      .then(setData)
      .catch(() => setData(null))
    vols.refresh()
  }
  useEffect(() => {
    let alive = true
    diskSpace(realPath)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.currentPath])

  const pct = data && data.totalBytes ? Math.round((data.usedBytes / data.totalBytes) * 100) : null
  return (
    <Popover
      align="right"
      buttonTitle={t('disk.title')}
      onOpen={load}
      panelClassName="w-72"
      label={<>{iconDisk}{pct !== null && <span className="tabular-nums">{pct}%</span>}</>}
    >
      {data ? (
        <div className="px-1 py-1">
          <div className="mb-1 truncate text-sm font-medium" title={data.volumeName}>{data.volumeName}</div>
          <progress className="progress progress-primary w-full" value={pct ?? 0} max={100} />
          <div className="mt-1 flex justify-between text-xs text-base-content/70">
            <span>{t('disk.used', { size: formatSize(data.usedBytes) })}</span>
            <span>{formatSize(data.totalBytes)}</span>
          </div>
          <div className="mt-0.5 text-xs text-base-content/50">{t('disk.free', { size: formatSize(data.freeBytes) })}</div>
        </div>
      ) : (
        <div className="px-1 py-2 text-xs text-base-content/60">{t('disk.loading')}</div>
      )}
      <div className="mt-2 border-t border-base-300 pt-1.5">
        <div className="mb-0.5 px-1 text-[10px] font-semibold uppercase tracking-wide opacity-60">{t('volumes.title')}</div>
        {vols.loading && <div className="px-1 py-1 text-xs text-base-content/60">{t('disk.loading')}</div>}
        {!vols.loading && vols.error !== '' && <div className="px-1 py-1 text-xs text-error">{t('volumes.error')}</div>}
        {!vols.loading &&
          vols.volumes.map((v) => {
            const current = ctx.currentPath === v.mountPoint || ctx.currentPath.startsWith(`${v.mountPoint}/`) || (v.mountPoint === '/' && !ctx.currentPath.startsWith('/Volumes/'))
            const p = v.totalBytes ? Math.round((v.usedBytes / v.totalBytes) * 100) : 0
            return (
              <button
                key={v.mountPoint}
                data-bar-control
                className={`flex w-full flex-col gap-0.5 rounded-md px-1.5 py-1 text-left text-xs hover:bg-base-200 ${current ? 'font-semibold' : ''}`}
                title={`${v.mountPoint} · ${v.device}`}
                onClick={() => ctx.navigate(v.mountPoint)}
              >
                <span className="flex w-full items-center gap-1.5">
                  <span aria-hidden>{v.kind === 'internal' ? '💽' : v.kind === 'network' ? '🌐' : '💾'}</span>
                  <span className="min-w-0 flex-1 truncate">{v.name}</span>
                  <span className="tabular-nums opacity-60">{p}%</span>
                </span>
                <progress className="progress progress-primary h-1 w-full" value={p} max={100} />
                <span className="opacity-60">{t('volumes.freeOf', { free: formatSize(v.freeBytes), total: formatSize(v.totalBytes) })}</span>
              </button>
            )
          })}
      </div>
    </Popover>
  )
}

/* ---------- trash (right) ---------- */
export function TrashWidget({ ctx }: { ctx: WidgetCtx }) {
  const { t } = useTranslation()
  const trashDir = ctx.home ? `${ctx.home}/.Trash` : ''
  const [items, setItems] = useState<TrashItem[]>([])
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [menuId, setMenuId] = useState<string | null>(null)
  const lastFetch = useRef(0)

  const load = (force = false) => {
    const now = Date.now()
    if (!force && now - lastFetch.current < 30_000) return
    lastFetch.current = now
    trashList().then(setItems).catch(() => setItems([]))
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.home])

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      setMenuId(null)
      load(true)
      if (ok) ctx.setStatus(ok, 'success')
    } catch (e) {
      ctx.setStatus(String(e), 'error')
    }
  }

  const count = items.length
  const rowActions = (it: TrashItem) => (
    <div className="menu menu-sm absolute left-1 top-full z-50 mt-0.5 w-48 rounded-box border border-base-300 bg-base-100 p-1 shadow-xl">
      <li><button data-bar-control onClick={() => void act(async () => { const p = await trashRestore(it.id); ctx.refresh(); return p }, t('trash.restored'))}>{t('trash.restore')}</button></li>
      <li><button data-bar-control onClick={() => void act(async () => openPath(`${trashDir}/${it.id}`), '')}>{t('trash.openItem')}</button></li>
      <li><button data-bar-control onClick={() => void act(async () => revealInFinder(`${trashDir}/${it.id}`), '')}>{t('trash.reveal')}</button></li>
      <li><button data-bar-control onClick={() => { void navigator.clipboard?.writeText(it.originalPath); ctx.setStatus(t('status.pathCopied'), 'success'); setMenuId(null) }}>{t('trash.copyPath')}</button></li>
      <li><button data-bar-control className="text-error" onClick={() => void act(() => trashDeleteForever(it.id), t('trash.deletedForever'))}>{t('trash.deleteForever')}</button></li>
    </div>
  )

  return (
    <Popover
      align="right"
      open={open}
      onOpenChange={(o) => { setOpen(o); if (!o) setMenuId(null) }}
      buttonTitle={t('trash.widget')}
      onOpen={() => load()}
      panelClassName="w-80"
      label={
        <>
          {iconTrash}
          {count > 0 && <span className="badge badge-xs badge-primary badge-outline">{count}</span>}
        </>
      }
    >
      <div className="max-h-56 overflow-y-auto">
        {count === 0 ? (
          <div className="px-1 py-2 text-xs text-base-content/60">{t('trash.empty')}</div>
        ) : (
          <ul className="menu menu-sm w-full">
            {items.slice(0, 50).map((it) => (
              <li key={it.id} className="relative" onContextMenu={(e) => { e.preventDefault(); setMenuId((m) => (m === it.id ? null : it.id)) }}>
                <button
                  data-bar-control
                  className="tooltip tooltip-top flex w-full items-center justify-between gap-2"
                  title={it.originalPath}
        data-tip={it.originalPath}
                  onClick={() => setMenuId((m) => (m === it.id ? null : it.id))}
                >
                  <span className="min-w-0 truncate">{basenameOf(it.originalPath)}</span>
                  <span className="shrink-0 text-[10px] text-base-content/50">{formatDate(it.deletedAt)}</span>
                </button>
                {menuId === it.id && rowActions(it)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-2 flex justify-between gap-2 border-t border-base-300 pt-2">
        <button data-bar-control className="btn btn-ghost btn-xs" onClick={() => openPath(trashDir).catch((e) => ctx.setStatus(String(e), 'error'))}>
          {t('trash.open')}
        </button>
        <button data-bar-control className="btn btn-error btn-xs" disabled={count === 0} onClick={() => setConfirm(true)}>
          {t('trash.emptyAction')}
        </button>
      </div>

      {confirm && (
        <div className="modal modal-open fixed inset-0 z-[60]" onMouseDown={() => setConfirm(false)}>
          <div className="modal-box max-w-sm" onMouseDown={(e) => e.stopPropagation()}>
            <h3 className="mb-2 font-semibold">{t('trash.confirmTitle')}</h3>
            <p className="text-sm text-base-content/70">{t('trash.confirmBody', { count })}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button data-bar-control className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)}>{t('common.cancel')}</button>
              <button data-bar-control className="btn btn-error btn-sm" onClick={() => { setConfirm(false); setOpen(false); void act(async () => { await trashEmpty(); try { await emptyTrash() } catch { /* Finder may be denied/not-running; Clive-side already cleared */ } }, t('trash.emptied')) }}>
                {t('trash.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Popover>
  )
}

/* ---------- quick launcher (right, far end) ---------- */
export function LauncherWidget({ ctx }: { ctx: WidgetCtx }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const fire = (fn: () => void) => {
    fn()
    setOpen(false)
  }
  return (
    <Popover
      align="right"
      open={open}
      onOpenChange={setOpen}
      buttonTitle={t('launcher.title')}
      panelClassName="p-0"
      label={iconZap}
    >
      <ul className="menu menu-sm w-52 p-1">
        <li>
          <button data-bar-control onClick={() => fire(ctx.openTerminalHere)}>
            <Wi d="M4 17l6-6-6-6M12 19h8" />
            <span className="text-left">{t('launcher.openTerminal')}</span>
          </button>
        </li>
        <li>
          <button data-bar-control onClick={() => fire(() => ctx.setHiddenVisible(!ctx.hiddenVisible))}>
            <Wi d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
            <span className="text-left flex-1">{ctx.hiddenVisible ? t('launcher.hideHidden') : t('launcher.showHidden')}</span>
            {ctx.hiddenVisible && <span className="badge badge-xs badge-primary">on</span>}
          </button>
        </li>
      </ul>
    </Popover>
  )
}
