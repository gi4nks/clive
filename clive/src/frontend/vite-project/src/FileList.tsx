import { useEffect, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate, formatSize, kindOf, type FileEntry } from './api'
import { ChildCountBadge } from './ChildCountBadge'
import { FileIcon } from './FileIcon'
import { getAppConfig, useAppConfig } from './settings/appConfig'
import { clampWidth, fitColWidths, COL_MIN, COL_MAX } from './resize'
import { SplitHandle } from './SplitHandle'

export type SortKey = 'name' | 'size' | 'modified'
export interface SortState {
  key: SortKey
  dir: 1 | -1
}

interface FileListProps {
  paneId: 'left' | 'right'
  files: FileEntry[]
  selected: Set<string>
  renamingPath: string | null
  view: 'list' | 'grid'
  sort: SortState
  onSortChange: (key: SortKey) => void
  onItemClick: (file: FileEntry, event: MouseEvent) => void
  onItemDoubleClick: (file: FileEntry) => void
  onRenameConfirm: (file: FileEntry, newName: string) => void
  onRenameCancel: () => void
  onItemContextMenu: (file: FileEntry, x: number, y: number, e: MouseEvent) => void
  /** If provided, rows become draggable; returns a JSON payload for dataTransfer. */
  dragPayload?: (file: FileEntry) => string
  /** Drop a drag onto a folder row -> move/copy those paths INTO that folder. */
  onDropToFolder?: (dir: string, paths: string[], copy: boolean) => void
}

const normPath = (p: string): string => p.replace(/\/+$/, '') || '/'
const parentOfPath = (p: string): string => {
  const i = p.lastIndexOf('/')
  return i > 0 ? p.slice(0, i) : '/'
}
/** Sources that cannot move into `dir`: the dir itself, its ancestors (would be
 *  move-into-own-subtree), or files already directly inside it. */
export function filterFolderDrop(dir: string, paths: string[]): string[] {
  const nd = normPath(dir)
  return paths.filter((p) => {
    const n = normPath(p)
    return n !== nd && !nd.startsWith(`${n}/`) && parentOfPath(n) !== nd
  })
}

function writeDrag(e: import('react').DragEvent, file: FileEntry, dragPayload?: (f: FileEntry) => string) {
  const p = dragPayload?.(file)
  if (p) {
    e.dataTransfer.setData('application/x-clive-paths', p)
    e.dataTransfer.effectAllowed = 'copyMove'
  }
}

function SortHeader({
  label,
  column,
  sort,
  onSortChange,
  align = 'left',
}: {
  label: string
  column: SortKey
  sort: SortState
  onSortChange: (key: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = sort.key === column
  return (
    <button
      onClick={() => onSortChange(column)}
      className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide transition-colors hover:text-base-content/60:text-base-content/60 ${
        active ? 'text-base-content/60' : 'text-base-content/60'
      } ${align === 'right' ? 'justify-end' : ''}`}
    >
      {label}
      <span className={`text-[9px] ${active ? '' : 'opacity-0'}`}>{active && sort.dir === 1 ? '▲' : '▼'}</span>
    </button>
  )
}

export function FileList({
  paneId,
  files,
  selected,
  renamingPath,
  view,
  sort,
  onSortChange,
  onItemClick,
  onItemDoubleClick,
  onRenameConfirm,
  onRenameCancel,
  onItemContextMenu,
  dragPayload,
  onDropToFolder,
}: FileListProps) {
  const { t } = useTranslation()
  const [cfg, setCfg] = useAppConfig()
  const [dropHover, setDropHover] = useState<string | null>(null)
  const { name: wName, size: wSize } = cfg.colWidths[paneId]
  const listRef = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState(0)
  useEffect(() => {
    const el = listRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setAvail(el.clientWidth))
    ro.observe(el)
    setAvail(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const fit = fitColWidths(avail, wName, wSize)
  const colTemplate = `${fit.name}px ${fit.size}px minmax(0, 1fr)`

  // Drop binder for folder rows/cells: makes a directory a drop target so a
  // drag of the current selection can be moved/copied INTO it (Task: intra-pane
  // drag onto a sibling folder). No-op for non-dirs or when no handler is set.
  const folderDrop = (file: FileEntry) => {
    if (!file.isDir || !onDropToFolder) return {}
    return {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer?.types.includes('application/x-clive-paths')) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move'
        if (dropHover !== file.path) setDropHover(file.path)
      },
      onDragLeave: () => {
        if (dropHover === file.path) setDropHover(null)
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setDropHover(null)
        const raw = e.dataTransfer?.getData('application/x-clive-paths')
        if (!raw) return
        let paths: unknown
        try {
          paths = JSON.parse(raw)
        } catch {
          return
        }
        if (!Array.isArray(paths)) return
        const filtered = filterFolderDrop(file.path, paths as string[])
        if (filtered.length) onDropToFolder(file.path, filtered, !!e.altKey)
      },
    }
  }

  const dragRef = useRef<{ col: 'name' | 'size'; lastX: number } | null>(null)

  const onColPointerDown = (col: 'name' | 'size') => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { col, lastX: e.clientX }
    e.currentTarget.setPointerCapture?.(e.pointerId)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }
  const onColPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.lastX
    d.lastX = e.clientX
    const cw = getAppConfig().colWidths
    const next = clampWidth(cw[paneId][d.col] + dx, COL_MIN, COL_MAX)
    setCfg({ colWidths: { ...cw, [paneId]: { ...cw[paneId], [d.col]: next } } })
  }
  const onColPointerUp = () => {
    dragRef.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  if (view === 'grid') {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="scroll-area flex-1 p-4">
          {files.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-sm text-base-content/60">
            <span className="text-5xl">📭</span>
            <span>{t('fileList.noFiles')}</span>
          </div>
          ) : <div className="mx-auto grid max-w-[1200px] grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
            {files.map((file) => {
              const isSelected = selected.has(file.path)
              return (
                <div
                  key={file.path}
                  data-file-path={file.path}
                  draggable={!!dragPayload}
                  onDragStart={(e) => writeDrag(e, file, dragPayload)}
                  role="button"
                  tabIndex={0}
                  aria-selected={isSelected}
                  onClick={(e) => onItemClick(file, e)}
                  onDoubleClick={() => onItemDoubleClick(file)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    onItemContextMenu(file, e.clientX, e.clientY, e)
                  }}
                  {...folderDrop(file)}
                  title={file.name}
                  className={`flex select-none flex-col items-center gap-1 rounded-lg p-2 cursor-default border ${
                    dropHover === file.path ? 'ring-2 ring-primary' : ''
                  } ${
                    isSelected
                      ? 'border-primary/60 bg-primary/20'
                      : 'border-transparent hover:bg-base-200:bg-base-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-neutral-900:ring-offset-neutral-950'
                  }`}
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-base-200">
                    <div className="scale-[1.5]"><FileIcon entry={file} /></div>
                  </div>
                  <span className="max-w-full truncate text-center text-xs font-medium leading-tight">{file.name}</span>
                  <span className="text-[10px] text-base-content/60">
                    {file.isDir ? t('fileList.folder') : formatSize(file.size)}
                  </span>
                </div>
              )
            })}
          </div>
          }
        </div>
        <div className="sr-only">{kindOf(files[0])}</div>
      </div>
    )
  }

  return (
    <div ref={listRef} className="flex h-full min-h-0 select-none flex-col">
      <div className="grid shrink-0 items-center gap-2 border-b border-base-300 px-3 py-1" style={{ gridTemplateColumns: colTemplate }}>
        <div className="flex min-w-0 items-center">
          <SortHeader label={t('fileList.name')} column="name" sort={sort} onSortChange={onSortChange} />
          <SplitHandle className="ms-auto w-3 shrink-0" label={t('resize.title')} onPointerDown={onColPointerDown('name')} onPointerMove={onColPointerMove} onPointerUp={onColPointerUp} />
        </div>
        <div className="flex min-w-0 items-center justify-end">
          <SortHeader label={t('fileList.size')} column="size" sort={sort} onSortChange={onSortChange} align="right" />
          <SplitHandle className="ms-1 w-3 shrink-0" label={t('resize.title')} onPointerDown={onColPointerDown('size')} onPointerMove={onColPointerMove} onPointerUp={onColPointerUp} />
        </div>
        <SortHeader label={t('fileList.date')} column="modified" sort={sort} onSortChange={onSortChange} align="right" />
      </div>
      <div className="scroll-area flex-1 py-1">
        {files.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-sm text-base-content/60">
            <span className="text-5xl">📭</span>
            <span>{t('fileList.noFiles')}</span>
          </div>
        ) : files.map((file) => {
          const isSelected = selected.has(file.path)
          return (
            <div
              key={file.path}
              data-file-path={file.path}
              draggable={!!dragPayload}
              onDragStart={(e) => writeDrag(e, file, dragPayload)}
              role="button"
              tabIndex={0}
              aria-selected={isSelected}
              onClick={(e) => onItemClick(file, e)}
              onDoubleClick={() => onItemDoubleClick(file)}
              onContextMenu={(e) => {
                e.preventDefault()
                onItemContextMenu(file, e.clientX, e.clientY, e)
              }}
              {...folderDrop(file)}
              className={`grid items-center gap-3 px-3 py-1 cursor-default border-l-2 ${
                dropHover === file.path ? 'bg-primary/10 ring-1 ring-inset ring-primary' : ''
              } ${
                isSelected
                  ? 'border-primary bg-primary/20'
                  : 'border-transparent hover:bg-base-200:bg-base-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-neutral-900:ring-offset-neutral-950'
              }`}
              style={{ gridTemplateColumns: colTemplate }}
            >
              <div className="flex min-w-0 items-center gap-2.5">
<FileIcon entry={file} />
                {renamingPath === file.path ? (
                  <RenameInput
                    file={file}
                    onConfirm={(name) => onRenameConfirm(file, name)}
                    onCancel={onRenameCancel}
                  />
                ) : (
                  <span className="truncate text-[13px] font-medium">{file.name}</span>
                )}
              </div>
              {file.isDir ? (
                <ChildCountBadge path={file.path} />
              ) : (
                <span className="truncate text-right text-xs tabular-nums text-base-content/60">
                  {formatSize(file.size)}
                </span>
              )}
              <span className="truncate text-right text-xs text-base-content/60">
                {formatDate(file.modified)}
              </span>
              <span className="sr-only">{kindOf(file)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RenameInput({
  file,
  onConfirm,
  onCancel,
}: {
  file: FileEntry
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  const baseName = file.isDir ? file.name : file.name.replace(/\.([^.]*)$/, '') || file.name
  const [name, setName] = useState(baseName)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const tryConfirm = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== file.name) onConfirm(trimmed)
    else onCancel()
  }

  return (
    <input
      ref={ref}
      value={name}
      onChange={(e) => setName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.stopPropagation()
          tryConfirm()
        } else if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
      onBlur={tryConfirm}
      className="w-full min-w-0 rounded border border-primary px-1.5 py-0.5 text-[13px] outline-none"
    />
  )
}