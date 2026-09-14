import { useEffect, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { MAX_PINNED, pinnedLabel, placesFor } from './pinned'
import type { RemoteLocation } from './settings/appConfig'
import { connectSmb, disconnectVolume, formatSize, listDir } from './api'
import { useVolumes } from './volumes'

interface Props {
  open: boolean
  home: string
  pinned: string[]
  remoteLocations: RemoteLocation[]
  width?: number
  onToggle: () => void
  onOpenItem: (path: string) => void
  onDropToDir: (dir: string, paths: string[], copy: boolean) => void
  onPinPaths: (paths: string[]) => void
  onUnpin: (path: string) => void
  onReorder: (path: string, toIndex: number) => void
  onAdd: () => void
  onRemoveRemote: (id: string) => void
  onRemoteError: (message: string) => void
  onRowContext: (e: ReactMouseEvent, info: { path: string; label: string; fixed: boolean }) => void
}

const parseDrop = (e: DragEvent): string[] | null => {
  const raw = e.dataTransfer.getData('application/x-clive-paths')
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as string[]
    return Array.isArray(p) && p.length ? p : null
  } catch {
    return null
  }
}

export function Sidebar(props: Props) {
  const { t } = useTranslation()
  const [dragOverRow, setDragOverRow] = useState<string | null>(null)
  const [remoteStatus, setRemoteStatus] = useState<Record<string, 'online' | 'offline' | 'connecting'>>({})
  const [remoteBusy, setRemoteBusy] = useState<string | null>(null)
  const vols = useVolumes()
  const places = placesFor(props.home)

  useEffect(() => {
    let cancelled = false
    for (const remote of props.remoteLocations) {
      void listDir(remote.path).then(() => {
        if (!cancelled) setRemoteStatus((s) => ({ ...s, [remote.id]: 'online' }))
      }).catch(() => {
        if (!cancelled) setRemoteStatus((s) => ({ ...s, [remote.id]: 'offline' }))
      })
    }
    return () => { cancelled = true }
  }, [props.remoteLocations])

  if (!props.open) {
    // Collapsed rail: a thin strip with just an expand affordance.
    return (
      <div
        role="navigation"
        aria-label={t('sidebar.title')}
        onDoubleClick={props.onToggle}
        className="flex w-8 shrink-0 flex-col items-center border-r border-base-300 bg-base-200/60 py-2"
        title={t('sidebar.expand')}
      >
        <button data-bar-control className="tooltip tooltip-right btn btn-ghost btn-xs !min-h-0" aria-label={t('sidebar.expand')}
              title={t('sidebar.expand')}
        data-tip={t('sidebar.expand')} onClick={props.onToggle}>
          ▸
        </button>
        <span className="mt-2 select-none text-[10px] opacity-40" style={{ writingMode: 'vertical-rl' }}>
          {t('sidebar.title')}
        </span>
      </div>
    )
  }

  const Row = ({ path, label, fixed }: { path: string; label: string; fixed?: boolean }) => (
    <li
      draggable={!fixed}
      onDragStart={(e) => e.dataTransfer.setData('text/x-pin', path)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('text/x-pin')) {
          e.preventDefault()
          setDragOverRow(path)
        }
      }}
      onDragLeave={() => setDragOverRow((cur) => (cur === path ? null : cur))}
      onDrop={(e) => {
        const src = e.dataTransfer.getData('text/x-pin')
        setDragOverRow(null)
        if (src && !fixed) {
          e.preventDefault()
          props.onReorder(src, props.pinned.indexOf(path))
          return
        }
        // Otherwise a file transfer drop: route into the item (folder) or its parent (file)
        const paths = parseDrop(e)
        if (paths) {
          e.preventDefault()
          props.onDropToDir(parentOf(path), paths, e.altKey)
        }
      }}
      className={`group ${dragOverRow === path ? 'bg-primary/15' : ''}`}
    >
      <button
        data-bar-control
        className="w-full text-left"
        onClick={() => props.onOpenItem(path)}
        title={path}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          props.onRowContext(e, { path, label, fixed: !!fixed })
        }}
      >
        <span className="block truncate">{label}</span>
      </button>
      {!fixed && (
        <button
          data-bar-control
          className="tooltip tooltip-right btn btn-ghost btn-xs absolute right-1 hidden !h-5 !min-h-0 group-hover:inline-flex"
          aria-label={t('sidebar.unpin')}
              title={t('sidebar.unpin')}
        data-tip={t('sidebar.unpin')}
          onClick={() => props.onUnpin(path)}
        >
          ×
        </button>
      )}
    </li>
  )

  return (
    <div
      role="navigation"
      aria-label={t('sidebar.title')}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-clive-paths')) e.preventDefault()
      }}
      onDrop={(e) => {
        const paths = parseDrop(e)
        if (paths) {
          e.preventDefault()
          props.onPinPaths(paths)
        }
      }}
      style={{ width: props.width ?? 176 }}
      className="relative flex shrink-0 flex-col overflow-y-auto border-r border-base-300 bg-base-200/60 text-sm"
    >
      <div className="flex shrink-0 items-center justify-between px-2 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60">{t('sidebar.title')}</span>
        <div className="flex items-center">
          <button data-bar-control className="tooltip tooltip-right btn btn-ghost btn-xs !h-6 !min-h-0 px-1.5" aria-label={t('sidebar.add')} title={t('sidebar.add')}
        data-tip={t('sidebar.add')} onClick={props.onAdd}>
            ＋
          </button>
          <button data-bar-control className="tooltip tooltip-right btn btn-ghost btn-xs !h-6 !min-h-0 px-1.5" aria-label={t('sidebar.collapse')} title={t('sidebar.collapse')}
        data-tip={t('sidebar.collapse')} onClick={props.onToggle}>
            ◂
          </button>
        </div>
      </div>

      <ul className="menu menu-sm w-full rounded-none bg-transparent p-1">
        <li className="menu-title px-2 text-[10px] uppercase opacity-60">{t('sidebar.places')}</li>
        {places.map((pl) => (
          <Row key={pl.path} path={pl.path} label={t(`places.${pl.labelKey}`)} fixed />
        ))}
        {props.pinned.length > 0 && <li className="menu-title mt-2 px-2 text-[10px] uppercase opacity-60">{t('sidebar.favourites')}</li>}
        {props.pinned.map((p) => (
          <Row key={p} path={p} label={pinnedLabel(p)} />
        ))}
        {props.pinned.length >= MAX_PINNED && <li className="px-2 py-1 text-[10px] opacity-50">{t('sidebar.maxReached')}</li>}
        {props.remoteLocations.length > 0 && <li className="menu-title mt-3 px-2 text-[10px] uppercase opacity-60">{t('sidebar.remote')}</li>}
        {props.remoteLocations.map((remote) => {
          const status = remoteStatus[remote.id]
          const isSmb = remote.kind === 'smb' && !!remote.endpoint
          const openRemote = async () => {
            if (!isSmb || status === 'online') {
              props.onOpenItem(remote.path)
              return
            }
            setRemoteBusy(remote.id)
            setRemoteStatus((s) => ({ ...s, [remote.id]: 'connecting' }))
            try {
              await connectSmb(remote.endpoint!)
              // Finder may need a moment to finish mounting after the command
              // returns. Poll the configured mount point before opening it.
              for (let i = 0; i < 12; i++) {
                try {
                  await listDir(remote.path)
                  setRemoteStatus((s) => ({ ...s, [remote.id]: 'online' }))
                  props.onOpenItem(remote.path)
                  return
                } catch {
                  await new Promise((resolve) => setTimeout(resolve, 500))
                }
              }
              throw new Error('Remote volume did not become available')
            } catch (e) {
              setRemoteStatus((s) => ({ ...s, [remote.id]: 'offline' }))
              props.onRemoteError(e instanceof Error ? e.message : String(e))
            } finally {
              setRemoteBusy(null)
            }
          }
          const disconnectRemote = async () => {
            setRemoteBusy(remote.id)
            try {
              await disconnectVolume(remote.path)
              setRemoteStatus((s) => ({ ...s, [remote.id]: 'offline' }))
            } catch (e) {
              props.onRemoteError(e instanceof Error ? e.message : String(e))
            } finally {
              setRemoteBusy(null)
            }
          }
          return (
            <li key={remote.id} className="group relative">
              <button
                data-bar-control
                className="flex w-full min-w-0 items-center gap-2 pr-7 text-left"
                onClick={() => void openRemote()}
                disabled={remoteBusy === remote.id}
                title={remote.path}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${status === 'online' ? 'bg-success' : status === 'offline' ? 'bg-error' : 'bg-base-content/30'}`} aria-label={status === 'online' ? t('sidebar.online') : status === 'offline' ? t('sidebar.offline') : t('sidebar.checking')} />
                <span className="min-w-0 truncate">{remote.name}</span>
              </button>
              {isSmb && status === 'online' && (
                <button data-bar-control className="tooltip tooltip-right btn btn-ghost btn-xs absolute right-7 hidden !h-5 !min-h-0 group-hover:inline-flex" aria-label={t('sidebar.disconnectRemote')} title={t('sidebar.disconnectRemote')}
        data-tip={t('sidebar.disconnectRemote')} onClick={() => void disconnectRemote()}>↘</button>
              )}
              <button
                data-bar-control
                className="tooltip tooltip-right btn btn-ghost btn-xs absolute right-1 hidden !h-5 !min-h-0 group-hover:inline-flex"
                aria-label={t('sidebar.removeRemote')}
                title={t('sidebar.removeRemote')}
        data-tip={t('sidebar.removeRemote')}
                onClick={() => props.onRemoveRemote(remote.id)}
              >×</button>
            </li>
          )
        })}
        <li className="menu-title mt-3 px-2 text-[10px] uppercase opacity-60">{t('volumes.title')}</li>
        {vols.volumes.map((v) => {
          const eject = async () => {
            if (!window.confirm(t('volumes.ejectConfirm', { name: v.name }))) return
            try {
              await vols.eject(v.mountPoint)
            } catch (e) {
              props.onRemoteError(e instanceof Error ? e.message : String(e))
            }
          }
          return (
            <li key={v.mountPoint} className="group relative">
              <button
                data-bar-control
                className="flex w-full min-w-0 items-center gap-2 pr-7 text-left"
                onClick={() => {
                  if (v.mountPoint === '/' && v.kind === 'internal') props.onOpenItem('/')
                  else props.onOpenItem(v.mountPoint)
                }}
                title={`${v.mountPoint} · ${v.device}`}
              >
                <span aria-hidden className="w-4 shrink-0 text-center">{v.kind === 'internal' ? '💽' : v.kind === 'network' ? '🌐' : '💾'}</span>
                <span className="min-w-0 flex-1 truncate">{v.name}</span>
                <span className="shrink-0 text-[10px] tabular-nums opacity-50">{formatSize(v.freeBytes)}</span>
              </button>
              {v.ejectable && (
                <button
                  data-bar-control
                  className="tooltip tooltip-right btn btn-ghost btn-xs absolute right-1 hidden !h-5 !min-h-0 group-hover:inline-flex"
                  aria-label={t('volumes.eject')}
                  title={t('volumes.eject')}
        data-tip={t('volumes.eject')}
                  onClick={() => void eject()}
                >⏏</button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// parent of a path (for file pins → drop target is their folder)
function parentOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i > 0 ? path.slice(0, i) : '/'
}
