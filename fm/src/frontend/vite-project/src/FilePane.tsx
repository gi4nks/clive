import { useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { FileEntry } from './api'
import { pinnedLabel } from './pinned'
import type { SortKey, SortState } from './FileList'
import { FileList } from './FileList'

export type PaneId = 'left' | 'right'
export interface PaneState {
  path: string
  entries: FileEntry[]
  selected: Set<string>
  anchorPath: string | null
  renamingPath: string | null
  query: string
  loading: boolean
}

interface Props {
  id: PaneId
  pane: PaneState
  files: FileEntry[]
  active: boolean
  view: 'list' | 'grid'
  sort: SortState
  home: string
  recents: string[]
  pinned: string[]
  onActivate: (id: PaneId) => void
  onCollapse?: (id: PaneId) => void
  onNavigate: (id: PaneId, path: string) => void
  onItemClick: (id: PaneId, file: FileEntry, event: ReactMouseEvent) => void
  onOpen: (id: PaneId, file: FileEntry) => void
  onContextMenu: (id: PaneId, file: FileEntry, x: number, y: number, e: ReactMouseEvent) => void
  onRenameConfirm: (file: FileEntry, newName: string) => void
  onRenameCancel: () => void
  onSortChange: (key: SortKey) => void
  dragPayload: (id: PaneId, file: FileEntry) => string
  onDropTransfer: (id: PaneId, paths: string[], copy: boolean) => void
  onDropToDir: (dir: string, paths: string[], copy: boolean) => void
}

const PLACES: { key: string; sub?: string }[] = [
  { key: 'home' },
  { key: 'desktop', sub: 'Desktop' },
  { key: 'documents', sub: 'Documents' },
  { key: 'downloads', sub: 'Downloads' },
  { key: 'pictures', sub: 'Pictures' },
  { key: 'music', sub: 'Music' },
]

export function FilePane(props: Props) {
  const { t } = useTranslation()
  const [goOpen, setGoOpen] = useState(false)
  const { id, pane, files, active } = props

  const pathParts = pane.path.split('/').filter(Boolean)

  const parentOf = (p: string) => (p !== '/' ? p.replace(/\/[^/]*$/, '') || '/' : '')
  const parseDrop = (e: DragEvent): string[] | null => {
    e.preventDefault()
    const raw = e.dataTransfer.getData('application/x-clive-paths')
    if (!raw) return null
    try {
      const paths = JSON.parse(raw) as string[]
      return Array.isArray(paths) && paths.length ? paths : null
    } catch {
      return null
    }
  }
  const canDrop = (e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move'
  }
  const onDrop = (e: DragEvent) => {
    const paths = parseDrop(e)
    if (paths) props.onDropTransfer(id, paths, !!e.altKey)
  }
  // Drop target bound to a specific folder (breadcrumb segment / Go-to item).
  const dropTo = (dir: string) => ({
    onDragOver: canDrop,
    onDrop: (e: DragEvent) => {
      const paths = parseDrop(e)
      if (paths) props.onDropToDir(dir, paths, !!e.altKey)
    },
  })

  return (
    <section
      role="region"
      aria-label={t(id === 'left' ? 'pane.left' : 'pane.right')}
      aria-current={active ? 'true' : undefined}
      onPointerDown={() => !active && props.onActivate(id)}
      onDragOver={canDrop}
      onDrop={onDrop}
      className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${
        active ? 'ring-1 ring-inset ring-primary' : ''
      }`}
    >
      {/* header: go-to + breadcrumb */}
      <div className="flex shrink-0 items-center gap-1 border-b border-base-300 bg-base-200/60 px-1.5 py-1 text-xs">
        <div className="relative">
          <button data-bar-control className="btn btn-ghost btn-xs !h-6 !min-h-0 px-1.5" title={t('pane.goTo')} onClick={() => setGoOpen((o) => !o)}>
            ⌄
          </button>
          {goOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setGoOpen(false)} />
              <div className="menu menu-sm absolute left-0 top-6 z-50 max-h-72 w-64 overflow-y-auto rounded-box border border-base-300 bg-base-100 p-1 shadow-lg">
                <li className="menu-title px-2 text-[10px] uppercase opacity-60">{t('pane.goTo')}</li>
                <li>
                  <button data-bar-control {...dropTo(parentOf(pane.path) || '/')} onClick={() => { props.onNavigate(id, parentOf(pane.path) || '/'); setGoOpen(false) }}>
                    {t('pane.parent')}
                  </button>
                </li>
                {props.home &&
                  PLACES.map((pl) => {
                    const dir = pl.sub ? `${props.home}/${pl.sub}` : props.home!
                    return (
                      <li key={pl.key}>
                        <button data-bar-control {...dropTo(dir)} onClick={() => { props.onNavigate(id, dir); setGoOpen(false) }}>
                          {t(`places.${pl.key}`)}
                        </button>
                      </li>
                    )
                  })}
                {props.pinned.length > 0 && <li className="menu-title mt-1 px-2 text-[10px] uppercase opacity-60">{t('sidebar.favourites')}</li>}
                {props.pinned.map((p) => (
                  <li key={p}>
                    <button
                      data-bar-control
                      title={p}
                      {...dropTo(parentOf(p))}
                      onClick={() => { props.onNavigate(id, p); setGoOpen(false) }}
                    >
                      <span className="truncate">{pinnedLabel(p)}</span>
                    </button>
                  </li>
                ))}
                {props.recents.length > 0 && <li className="menu-title mt-1 px-2 text-[10px] uppercase opacity-60">{t('places.recents')}</li>}
                {props.recents.map((r) => (
                  <li key={r}>
                    <button
                      data-bar-control
                      title={r}
                      {...dropTo(r)}
                      onClick={() => { props.onNavigate(id, r); setGoOpen(false) }}
                    >
                      <span className="truncate">{r.split('/').pop() || r}</span>
                    </button>
                  </li>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden whitespace-nowrap">
          {pathParts.length === 0 && <span className="text-base-content/50">/</span>}
          {pathParts.map((seg, i) => {
            const dir = '/' + pathParts.slice(0, i + 1).join('/')
            return (
              <span key={i} className="flex items-center gap-0.5">
                {i > 0 && <span className="text-base-content/40">/</span>}
                <button
                  data-bar-control
                  {...dropTo(dir)}
                  className="max-w-40 truncate rounded px-1 hover:bg-base-300"
                  onClick={() => props.onNavigate(id, dir)}
                >
                  {seg}
                </button>
              </span>
            )
          })}
        </div>
        {props.onCollapse && (
          <button
            data-bar-control
            className="btn btn-ghost btn-xs !h-6 !min-h-0 shrink-0 px-1.5"
            title={t('pane.collapse')}
            aria-label={t('pane.collapse')}
            onClick={() => props.onCollapse?.(id)}
          >
            {id === 'left' ? '◂' : '▸'}
          </button>
        )}
      </div>

      {/* list */}
      <div className="scroll-area min-h-0 flex-1">
        {pane.loading && files.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-base-content/60">{t('common.loading')}</div>
        ) : (
          <FileList
            paneId={id}
            files={files}
            selected={pane.selected}
            renamingPath={pane.renamingPath}
            view={props.view}
            sort={props.sort}
            onSortChange={props.onSortChange}
            onItemClick={(file, event) => props.onItemClick(id, file, event)}
            onItemDoubleClick={(file) => props.onOpen(id, file)}
            onRenameConfirm={props.onRenameConfirm}
            onRenameCancel={props.onRenameCancel}
            onItemContextMenu={(file, x, y, e) => props.onContextMenu(id, file, x, y, e)}
            dragPayload={(file) => props.dragPayload(id, file)}
          />
        )}
      </div>
    </section>
  )
}
