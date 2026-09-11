import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import {
  clearClipboard,
  copyPaths,
  createFolder,
  cutPaths,
  deleteToTrash,
  emptyTrash,
  getClipboard,
  homeDir,
  listDir,
  openPath,
  openTerminal,
  pastePaths,
  quickLook,
  rename,
  revealInFinder,
  undoPlan,
  type ClipboardInfo,
  type FileEntry,
} from './api'
import { type SortKey } from './FileList'
import { FilePane, type PaneId, type PaneState } from './FilePane'
import { PaneRail } from './PaneRail'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { isProtectedPath } from './systemGuard'
import { invalidateChildCount } from './childCount'
import { SplitHandle } from './SplitHandle'
import { clampWidth, collapsePane, SIDEBAR_MIN, SIDEBAR_MAX } from './resize'
import { StatusBar } from './StatusBar'
import type { WidgetCtx } from './widgetTypes'
import { useAppConfig, getAppConfig, initAppConfig, type AppConfig } from './settings/appConfig'
import { useAi } from './ai/useAi'
import { AiOverlay } from './ai/AiOverlay'
import { useChat } from './ai/useChat'
import { ChatDrawer } from './ai/ChatDrawer'
import { usePlan } from './ai/usePlan'
import { PlanPanel } from './ai/PlanPanel'
import { createPlanFromMessage, PLAN_MAX_ENTRIES } from './ai/createPlanFromMessage'
import { writeLastBatch, readLastBatch, clearLastBatch } from './ai/planJournalStore'
import { fullModelId } from './ai/settings'
import { SettingsModal } from './settings/SettingsModal'
import { TransferPicker } from './TransferPicker'
import { transferBatch } from './transfer'
import { Sidebar } from './Sidebar'
import { pinPath, unpinPath, reorderPinned } from './pinned'
import { useTranslation } from 'react-i18next'
import i18n from './i18n'

function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <div
      className="modal modal-open z-50"
      onMouseDown={onClose}
    >
      <div
        className="modal-box max-w-md"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  )
}

function ToolButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="btn btn-ghost btn-sm btn-square !min-h-0 !h-8 !w-8 rounded-lg text-base-content/70"
    >
      {children}
    </button>
  )
}

function StatusMessage({
  message,
  type,
  timeout,
}: {
  message: string
  type: 'success' | 'error' | 'info'
  timeout?: number
}) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const enter = setTimeout(() => setVisible(true), 10)
    const hide = setTimeout(() => setVisible(false), (timeout ?? 5000) + 10)
    const unmount = setTimeout(() => setVisible(false), (timeout ?? 5000) + 410)
    return () => {
      clearTimeout(enter)
      clearTimeout(hide)
      clearTimeout(unmount)
    }
  }, [timeout])
  const style =
    type === 'success'
      ? 'alert-success'
      : type === 'error'
        ? 'alert-error'
        : 'alert-info'
  return (
    <div
      role="status"
      className={`alert alert-soft pointer-events-none fixed top-4 left-1/2 z-50 w-auto max-w-lg -translate-x-1/2 justify-center gap-2 px-4 py-2 text-sm font-medium shadow-lg transition-all duration-300 ease-out ${style} ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      }`}
    >
      {message}
    </div>
  )
}

function ViewToggle({
  view,
  onChange,
}: {
  view: 'list' | 'grid'
  onChange: (v: 'list' | 'grid') => void
}) {
  const { t } = useTranslation()
  const base = 'btn btn-ghost btn-sm btn-square !h-8 !min-h-0'
  return (
    <div className="btn-group">
      <button
        title={t('toolbar.viewList')}
        className={`${base} ${view === 'list' ? 'btn-active' : ''}`}
        onClick={() => onChange('list')}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <button
        title={t('toolbar.viewGrid')}
        className={`${base} ${view === 'grid' ? 'btn-active' : ''}`}
        onClick={() => onChange('grid')}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <rect x="4" y="4" width="7" height="7" rx="1" />
          <rect x="13" y="4" width="7" height="7" rx="1" />
          <rect x="4" y="13" width="7" height="7" rx="1" />
          <rect x="13" y="13" width="7" height="7" rx="1" />
        </svg>
      </button>
    </div>
  )
}

function Ico({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  )
}
const IconBack = () => <Ico><path d="M15 6l-6 6 6 6" /></Ico>
const IconFwd = () => <Ico><path d="M9 6l6 6-6 6" /></Ico>
const IconUp = () => <Ico><path d="M6 14l6-6 6 6" /></Ico>
const IconHome = () => <Ico><path d="M4 11l8-7 8 7M6 10v9h12v-9" /></Ico>
const IconRefresh = () => <Ico><path d="M4 12a8 8 0 0 1 13.7-5.6L20 8M20 4v4h-4" /><path d="M20 12a8 8 0 0 1-13.7 5.6L4 16M4 20v-4h4" /></Ico>
const IconNewFolder = () => <Ico><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /><path d="M12 11v5M9.5 13.5h5" /></Ico>
const IconRename = () => <Ico><path d="M4 20h4L18 10l-4-4L4 16v4Z" /><path d="M13.5 6.5l4 4" /></Ico>
const IconTrash = () => <Ico><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></Ico>
const IconCopy = () => <Ico><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Ico>
const IconCut = () => <Ico><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><path d="M8 7.5L20 18M8 16.5L20 6" /></Ico>
const IconPaste = () => <Ico><rect x="6" y="4" width="12" height="16" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /></Ico>
const IconFinder = () => <Ico><circle cx="11" cy="11" r="6" /><path d="M20 20l-4-4" /></Ico>

export default function App() {
  const { t } = useTranslation()
  const [backStack, setBackStack] = useState<string[]>([])
  const [fwdStack, setFwdStack] = useState<string[]>([])
  const [clip, setClip] = useState<ClipboardInfo>({ paths: [], operation: null })
  const [editingPath, setEditingPath] = useState(false)
  const [pathDraft, setPathDraft] = useState('')
  const [statusMessage, setStatusMessage] = useState<{message: string, type: 'success'|'error'|'info', timeout?: number}|null>(null)
  type CtxMenu =
    | { x: number; y: number; paneId: PaneId; kind: 'file'; file: FileEntry }
    | { x: number; y: number; kind: 'place' | 'recent'; label: string; path: string }
    | { x: number; y: number; kind: 'sidebar'; label: string; path: string; fixed: boolean }
  const [contextMenu, setContextMenu] = useState<CtxMenu | null>(null)

  // --- per-pane browse state (dual-pane) ---
  const blankPane = (): PaneState => ({ path: '', entries: [], selected: new Set(), anchorPath: null, renamingPath: null, query: '', loading: false })
  const [panes, setPanes] = useState<Record<PaneId, PaneState>>({ left: blankPane(), right: blankPane() })
  const [active, setActive] = useState<PaneId>('left')

  const patch = useCallback((id: PaneId, fn: (p: PaneState) => PaneState) => {
    setPanes((prev) => ({ ...prev, [id]: fn(prev[id]) }))
  }, [])
  const panesRef = useRef(panes)
  const activeRef = useRef(active)
  useEffect(() => {
    panesRef.current = panes
    activeRef.current = active
  })
  // Stable (deps = []) so accessor callbacks don't churn every render.
  const patchActive = useCallback((fn: (p: PaneState) => PaneState) => patch(activeRef.current, fn), [patch])

  // Derived active-pane views so existing single-pane code keeps working.
  const P = panes[active]
  const currentPath = P.path
  const entries = P.entries
  const selected = P.selected
  const searchQuery = P.query
  const setSelected = useCallback((v: Set<string> | ((p: Set<string>) => Set<string>)) => patchActive((p) => ({ ...p, selected: typeof v === 'function' ? (v as (x: Set<string>) => Set<string>)(p.selected) : v })), [patchActive])
  const setRenamingPath = useCallback((v: string | null) => patchActive((p) => ({ ...p, renamingPath: v })), [patchActive])
  const setSearchQuery = useCallback((v: string | ((p: string) => string)) => patchActive((p) => ({ ...p, query: typeof v === 'function' ? (v as (x: string) => string)(p.query) : v })), [patchActive])

  const [cfg, setCfg] = useAppConfig()
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [transferReq, setTransferReq] = useState<{ mode: 'copy' | 'move'; paths: string[] } | null>(null)
  const [pasteInFlight, setPasteInFlight] = useState(false)
  const loadedRef = useRef(false)

  const [splitPct, setSplitPct] = useState<number>(() => {
    const v = parseFloat(localStorage.getItem('fm.split') || '')
    return Number.isFinite(v) && v > 0.15 && v < 0.85 ? v : 0.5
  })
  useEffect(() => {
    localStorage.setItem('fm.split', String(splitPct))
  }, [splitPct])

  // Row drag payload = the row's pane selection (or just the row if unselected).
  const dragPayload = useCallback(
    (id: PaneId, file: FileEntry) => {
      const p = panesRef.current[id]
      const sel = p.selected.has(file.path) ? [...p.selected] : [file.path]
      return JSON.stringify(sel)
    },
    [],
  )
  const startSplit = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const container = e.currentTarget.parentElement
    if (!container) return
    const startX = e.clientX
    const startPct = splitPct
    const w = container.clientWidth || 1
    const move = (ev: globalThis.PointerEvent) => {
      const next = startPct + (ev.clientX - startX) / w
      setSplitPct(Math.min(0.85, Math.max(0.15, next)))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [splitPct])

  // Drag the sidebar/content divider to resize the sidebar (persisted in config).
  const startSidebarResize = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = getAppConfig().sidebarWidth
    const max = Math.min(SIDEBAR_MAX, Math.floor(window.innerWidth * 0.6))
    const move = (ev: globalThis.PointerEvent) => setCfg({ sidebarWidth: clampWidth(startW + (ev.clientX - startX), SIDEBAR_MIN, max) })
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [setCfg])

  // --- dual-pane collapse (mirrors sidebar) ---
  const paneCollapsed = cfg.paneCollapsed
  const expandPane = useCallback(
    (id: PaneId) => {
      const pc = getAppConfig().paneCollapsed
      if (pc[id]) setCfg({ paneCollapsed: { ...pc, [id]: false } })
    },
    [setCfg],
  )
  // Activate a pane, expanding it first if it's collapsed.
  const activatePane = useCallback(
    (id: PaneId) => {
      expandPane(id)
      setActive(id)
    },
    [expandPane],
  )
  // Collapse/expand a pane (never both collapsed). Collapsing the active pane
  // moves focus to the other one.
  const toggleCollapse = useCallback(
    (id: PaneId) => {
      const next = collapsePane(getAppConfig().paneCollapsed, id)
      setCfg({ paneCollapsed: next })
      if (next[id] && activeRef.current === id) setActive(id === 'left' ? 'right' : 'left')
    },
    [setCfg],
  )
  // Focus mode: collapse the inactive pane (or re-expand it).
  const toggleFocus = useCallback(() => {
    toggleCollapse(activeRef.current === 'left' ? 'right' : 'left')
  }, [toggleCollapse])

  // Startup guard: never begin with the active pane collapsed.
  useEffect(() => {
    const pc = getAppConfig().paneCollapsed
    if (pc.left) setCfg({ paneCollapsed: { ...pc, left: false } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Derive persisted prefs from the central config; setters write back to it.
  const view = cfg.view
  const sort = cfg.sort
  const recents = cfg.recents
  const theme = cfg.theme
  const hiddenVisible = cfg.hiddenVisible
  const home = cfg.home
  const sidebarOpen = cfg.sidebarOpen
  const pinned = cfg.pinned
  const setView = useCallback((v: AppConfig['view']) => setCfg({ view: v }), [setCfg])
  const setHiddenVisible = useCallback((v: boolean) => setCfg({ hiddenVisible: v }), [setCfg])
  const setSidebarOpen = useCallback((v: boolean) => setCfg({ sidebarOpen: v }), [setCfg])
  const setPinned = useCallback(
    (u: string[] | ((p: string[]) => string[])) =>
      setCfg({ pinned: typeof u === 'function' ? u(getAppConfig().pinned) : u }),
    [setCfg],
  )
  // Accept value or updater; read the live config so the setter stays stable.
  const setSort = useCallback(
    (u: AppConfig['sort'] | ((p: AppConfig['sort']) => AppConfig['sort'])) =>
      setCfg({ sort: typeof u === 'function' ? u(getAppConfig().sort) : u }),
    [setCfg],
  )
  const setRecents = useCallback(
    (u: string[] | ((p: string[]) => string[])) =>
      setCfg({ recents: typeof u === 'function' ? u(getAppConfig().recents) : u }),
    [setCfg],
  )

  useEffect(() => {
    const root = document.documentElement
    if (theme) root.setAttribute('data-theme', theme)
    else root.removeAttribute('data-theme')
  }, [theme])

  const handleSetStatus = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info', timeout = 5000) => {
    setStatusMessage({ message, type, timeout })
  }, [])


  const refreshPane = useCallback(
    async (id: PaneId, path: string) => {
      invalidateChildCount()
      patch(id, (p) => ({ ...p, loading: true }))
      try {
        const items = await listDir(path, hiddenVisible)
        patch(id, (p) => ({ ...p, entries: items, loading: false }))
      } catch (err) {
        patch(id, (p) => ({ ...p, loading: false }))
        handleSetStatus(String(err), 'error')
      }
    },
    [hiddenVisible, handleSetStatus, patch],
  )
  const refresh = useCallback((path: string) => refreshPane(active, path), [active, refreshPane])

  const navigatePane = useCallback(
    async (id: PaneId, path: string, pushHistory = true) => {
      patch(id, (p) => ({ ...p, selected: new Set(), anchorPath: null, renamingPath: null, query: '', path }))
      if (id === active) setEditingPath(false)
      setContextMenu(null)
      if (pushHistory && id === active) {
        const prev = panesRef.current[id].path
        if (prev && prev !== path) setBackStack((b) => [...b, prev].filter(Boolean))
        setFwdStack([])
      }
      setRecents((prev) => [path, ...prev.filter((p) => p !== path)].slice(0, 12))
      await refreshPane(id, path)
    },
    [active, patch, refreshPane, setRecents],
  )
  const navigate = useCallback((path: string, pushHistory = true) => navigatePane(active, path, pushHistory), [active, navigatePane])

  useEffect(() => {
    const init = async () => {
      await initAppConfig()
      const c = getAppConfig()
      void i18n.changeLanguage(c.language)
      const h = c.home || (await homeDir())
      setCfg({ home: h })
      const parent = h !== '/' ? h.replace(/\/[^/]*$/, '') || '/' : '/'
      setPanes({
        left: { path: h, entries: [], selected: new Set(), anchorPath: null, renamingPath: null, query: '', loading: false },
        right: { path: parent, entries: [], selected: new Set(), anchorPath: null, renamingPath: null, query: '', loading: false },
      })
      await Promise.all([refreshPane('left', h), refreshPane('right', parent)])
      try {
        setClip(await getClipboard())
      } catch {
        /* no clipboard yet */
      }
    }
    if (!loadedRef.current) {
      loadedRef.current = true
      init()
    }
  }, [setCfg, refreshPane])

  // Keep BOTH panes fresh on a timer (skip a pane while its own list is loading).
  useEffect(() => {
    const timer = setInterval(() => {
      const ps = panesRef.current
      for (const id of ['left', 'right'] as PaneId[]) {
        const p = ps[id]
        if (p.path && !p.loading) void refreshPane(id, p.path)
      }
    }, 2000)
    return () => clearInterval(timer)
  }, [refreshPane])

  // ---- per-pane sorted + search-filtered view ----
  const sortEntries = useCallback(
    (list: FileEntry[]) => {
      const arr = [...list]
      arr.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        let c = 0
        if (sort.key === 'name') c = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        else if (sort.key === 'size') c = a.size - b.size
        else c = a.modified - b.modified
        return sort.dir * c
      })
      return arr
    },
    [sort],
  )
  const viewFor = useCallback(
    (id: PaneId) => {
      const p = panes[id]
      const s = sortEntries(p.entries)
      const q = p.query.trim().toLowerCase()
      return q ? s.filter((e) => e.name.toLowerCase().includes(q)) : s
    },
    [panes, sortEntries],
  )

  const sortedEntries = useMemo(() => sortEntries(entries), [entries, sortEntries]) // active
  const visibleEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return q ? sortedEntries.filter((e) => e.name.toLowerCase().includes(q)) : sortedEntries

  }, [sortedEntries, searchQuery])

  const ai = useAi({
    currentPath,
    entries: visibleEntries,
    setStatus: handleSetStatus,
    refresh: () => refresh(currentPath),
  })

  const goUp = useCallback(async () => {
    const parent = currentPath !== '/' ? currentPath.replace(/\/[^/]*$/, '') : ''
    if (parent && parent !== currentPath) await navigate(parent || '/')
  }, [currentPath, navigate])

  const goBack = useCallback(async () => {
    if (!backStack.length) return
    const prev = backStack[backStack.length - 1]
    setBackStack((s) => s.slice(0, -1))
    setFwdStack((s) => [...s, currentPath])
    patchActive((p) => ({ ...p, path: prev }))
    await refreshPane(active, prev)
  }, [backStack, currentPath, active, refreshPane, patchActive])

  const goForward = useCallback(async () => {
    if (!fwdStack.length) return
    const next = fwdStack[fwdStack.length - 1]
    setFwdStack((s) => s.slice(0, -1))
    setBackStack((s) => [...s, currentPath])
    patchActive((p) => ({ ...p, path: next }))
    await refreshPane(active, next)
  }, [currentPath, fwdStack, active, refreshPane, patchActive])

  const onOpen = useCallback(
    async (id: PaneId, file: FileEntry) => {
      if (file.isDir) await navigatePane(id, file.path)
      else await revealInFinder(file.path)
    },
    [navigatePane],
  )

  const handleItemClick = useCallback(
    (id: PaneId, file: FileEntry, event: MouseEvent) => {
      setActive(id)
      patch(id, (p) => {
        const list = sortEntries(p.entries)
        const idx = (path: string) => list.findIndex((e) => e.path === path)
        const next = new Set(p.selected)
        if (event.metaKey || event.ctrlKey) {
          if (next.has(file.path)) next.delete(file.path)
          else next.add(file.path)
          return { ...p, selected: next, anchorPath: file.path }
        }
        if (event.shiftKey && p.anchorPath) {
          const from = idx(p.anchorPath)
          const to = idx(file.path)
          if (from >= 0 && to >= 0) {
            const [lo, hi] = from < to ? [from, to] : [to, from]
            const set = new Set<string>()
            for (let i = lo; i <= hi; i++) set.add(list[i].path)
            return { ...p, selected: set }
          }
          return { ...p, selected: new Set([file.path]), anchorPath: file.path }
        }
        return { ...p, selected: new Set([file.path]), anchorPath: file.path }
      })
    },
    [patch, sortEntries],
  )

  const selectedEntries = useMemo(
    () => sortedEntries.filter((e) => selected.has(e.path)),
    [sortedEntries, selected],
  )

  const chat = useChat({
    currentPath,
    entries: visibleEntries,
    selected: selectedEntries,
    model: fullModelId(ai.sel),
    guardOn: cfg.guardSystemLocations,
    setStatus: handleSetStatus,
    refresh: () => refresh(currentPath),
  })

  // Chat drawer and AI overlay are mutually exclusive.
  useEffect(() => {
    if (chatOpen) ai.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ai.cancel only closes over stable setters
  }, [chatOpen])
  useEffect(() => {
    if (ai.busy || ai.hasPreview) setChatOpen(false)
  }, [ai.busy, ai.hasPreview])

  // --- AI Plan (Task 6): App owns the pipeline; ChatDrawer only forwards 🪄. ---
  const plan = usePlan()
  const [planBusy, setPlanBusy] = useState(false)
  const planAbort = useRef<AbortController | null>(null)
  const PLAN_TIMEOUT_MS = 90_000
  // Intentionally the RAW active-pane entries (not the search-filtered
  // visibleEntries the pipeline uses): the cap guards the folder size itself,
  // so being stricter than the listing sent is by design (R7).
  const canPlan = entries.length <= PLAN_MAX_ENTRIES
  // Persistent, dismissible banner: an empty plan is NOT a transient toast —
  // "nothing happened" is the most confusing failure mode of the wand.
  const [planEmpty, setPlanEmpty] = useState(false)

  const handleCreatePlan = useCallback(
    async (text: string) => {
      const ctrl = new AbortController()
      planAbort.current = ctrl
      const timer = setTimeout(() => ctrl.abort(), PLAN_TIMEOUT_MS)
      setPlanBusy(true)
      setPlanEmpty(false)
      try {
        const p = await createPlanFromMessage({
          text,
          entries: visibleEntries,
          currentPath,
          guardOn: cfg.guardSystemLocations,
          model: fullModelId(ai.sel),
          signal: ctrl.signal,
        })
        if (ctrl.signal.aborted) throw new Error('aborted')
        if (!p.ops.length) {
          console.warn('[plan] empty plan from model; expanding produced 0 ops', p)
          setPlanEmpty(true)
          handleSetStatus(i18n.t('plan.empty'), 'info')
          return
        }
        plan.setPlan(p)
      } catch (e) {
        const aborted = ctrl.signal.aborted || String(e).includes('abort')
        handleSetStatus(aborted ? i18n.t('plan.timeout') : String(e), 'error')
      } finally {
        clearTimeout(timer)
        planAbort.current = null
        setPlanBusy(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ai.sel/setPlan churn every render; handler is cheap
    [visibleEntries, currentPath, cfg.guardSystemLocations, ai.sel, plan.setPlan, handleSetStatus],
  )

  const cancelCreatePlan = useCallback(() => {
    planAbort.current?.abort()
  }, [])

  const [lastBatchId, setLastBatchId] = useState<string | null>(null)

  // R11: persist the last successfully applied batch so undo survives a restart.
  // M-2: a batch that applied nothing has no inverses to undo (and Rust never
  // consumes a 0-entry journal) — don't advertise an Undo for it.
  useEffect(() => {
    if (plan.phase !== 'applied' || !plan.batchId) return
    if (!plan.report || plan.report.applied === 0) return
    writeLastBatch({ batchId: plan.batchId, rootPath: plan.plan?.rootPath ?? null, createdAt: Date.now() })
  }, [plan.phase, plan.batchId, plan.plan?.rootPath, plan.report])

  // The journal is consumed by an in-panel undo: never keep a stale restart claim.
  useEffect(() => {
    if (plan.phase !== 'undone') return
    clearLastBatch()
    setLastBatchId(null)
  }, [plan.phase])

  useEffect(() => {
    const id = readLastBatch()
    if (id) setLastBatchId(id)
  }, [])
  const dismissLastBatch = useCallback(() => {
    clearLastBatch()
    setLastBatchId(null)
  }, [])
  const undoLastBatch = useCallback(async () => {
    if (!lastBatchId) return
    try {
      const r = await undoPlan(lastBatchId)
      handleSetStatus(i18n.t('plan.undoDone'), 'success')
      // M-3: the Rust side keeps a journal whose inverses ALL failed (retry is
      // possible, e.g. trash was restored) — mirror that here and only drop the
      // key when the journal was consumed or nothing failed.
      const retryable = r.applied === 0 && r.failed.length > 0
      if (!retryable) {
        clearLastBatch()
        setLastBatchId(null)
      }
    } catch (err) {
      const msg = String(err)
      // Dead-journal errors mean the pointer can never succeed; transient
      // failures (IPC, permission) keep the key so the user can retry (M-3).
      if (/invalid batchId|no journal|already undone|corrupt journal|unsupported journal version/.test(msg)) {
        clearLastBatch()
        setLastBatchId(null)
      }
      handleSetStatus(msg, 'error')
    }
  }, [lastBatchId, handleSetStatus])

  const handleRename = useCallback(
    async (file: FileEntry, newName: string) => {
      try {
        await rename(file.path, newName)
        setRenamingPath(null)
        await refresh(currentPath)
      } catch (err) {
        handleSetStatus(String(err), 'error')
        setRenamingPath(null)
      }
    },
    [currentPath, refresh, handleSetStatus, setRenamingPath],
  )

  const handleNewFolder = useCallback(async () => {
    const name = newFolderName.trim()
    if (!name) {
      setShowNewFolder(false)
      handleSetStatus(i18n.t('status.emptyName'), 'error', 3000)
      return
    }
    try {
      await createFolder(currentPath, name)
      setShowNewFolder(false)
      setNewFolderName('')
      await refresh(currentPath)
      handleSetStatus(i18n.t('status.folderCreated'), 'success')
    } catch (err) {
      handleSetStatus(String(err), 'error')
    }
  }, [currentPath, newFolderName, refresh, handleSetStatus])

  const handleDelete = useCallback(async () => {
    setShowDeleteConfirm(false)
    try {
      for (const file of selectedEntries) await deleteToTrash(file.path)
      setSelected(new Set())
      await refresh(currentPath)
      handleSetStatus(i18n.t('status.movedToTrash'), 'success')
    } catch (err) {
      handleSetStatus(String(err), 'error')
    }
  }, [currentPath, refresh, selectedEntries, handleSetStatus, setSelected])

  // Respect the "confirm destructive" preference: ask or act directly.
  const requestDelete = useCallback(() => {
    if (!selectedEntries.length) return
    if (cfg.confirmDestructive) setShowDeleteConfirm(true)
    else void handleDelete()
  }, [selectedEntries.length, cfg.confirmDestructive, handleDelete])

  const handleCopyCut = useCallback(
    async (op: 'copy' | 'move') => {
      const paths = selectedEntries.map((e) => e.path)
      if (!paths.length) return
      try {
        if (op === 'copy') await copyPaths(paths)
        else await cutPaths(paths)
        setClip(await getClipboard())
        handleSetStatus(i18n.t(op === 'copy' ? 'status.copied' : 'status.cut', { count: paths.length }), 'success')
      } catch (err) {
        handleSetStatus(String(err), 'error')
      }
    },
    [selectedEntries, handleSetStatus],
  )

  const handlePaste = useCallback(async () => {
    if (!clip.paths.length) return
    setPasteInFlight(true)
    try {
      await pastePaths(currentPath)
      setClip(await getClipboard())
      await refresh(currentPath)
      handleSetStatus(i18n.t('status.pasted'), 'success')
    } catch (err) {
      handleSetStatus(String(err), 'error')
    } finally {
      setPasteInFlight(false)
    }
  }, [clip, currentPath, refresh, handleSetStatus])

  const handleClearClip = useCallback(async () => {
    await clearClipboard()
    setClip({ paths: [], operation: null })
    handleSetStatus(i18n.t('status.clipboardCleared'), 'success')
  }, [handleSetStatus])

  const handleEmptyTrash = useCallback(async () => {
    try {
      await emptyTrash()
      handleSetStatus(i18n.t('status.trashEmptied'), 'success')
    } catch (err) {
      handleSetStatus(String(err), 'error')
    }
  }, [handleSetStatus])

  const handleOpenTerminalHere = useCallback(async () => {
    try {
      await openTerminal(currentPath)
    } catch (err) {
      handleSetStatus(String(err), 'error')
    }
  }, [currentPath, handleSetStatus])

  // Copy/move a set of paths into dstDir via the batch command (unique dest, no
  // clobber; server-side), then refresh both panes.
  const applyTransfer = useCallback(
    async (dstDir: string, srcPaths: string[], mode: 'copy' | 'move') => {
      if (!srcPaths.length) return
      const res = await transferBatch(srcPaths, dstDir, mode)
      if (res.applied) handleSetStatus(i18n.t(mode === 'copy' ? 'transfer.done' : 'transfer.moved', { count: res.applied }), 'success')
      if (res.failures.length) handleSetStatus(i18n.t('transfer.failed', { count: res.failures.length }), 'error')
      const ps = panesRef.current
      await Promise.all([refreshPane('left', ps.left.path), refreshPane('right', ps.right.path)])
    },
    [handleSetStatus, refreshPane],
  )

  const handleTransfer = useCallback(
    async (dstDir: string) => {
      const req = transferReq
      if (!req) return
      setTransferReq(null)
      await applyTransfer(dstDir, req.paths, req.mode)
    },
    [transferReq, applyTransfer],
  )

  // Swap the two panes' directories (paths + loaded entries + selection).
  const swapPanes = useCallback(() => setPanes((prev) => ({ left: prev.right, right: prev.left })), [])

  // Send the active pane's selection into the other pane's current folder.
  const sendToOtherPane = useCallback(
    (mode: 'copy' | 'move') => {
      const a = panesRef.current[active]
      const other = active === 'left' ? 'right' : 'left'
      const dst = panesRef.current[other].path
      if (!dst) return
      expandPane(other)
      void applyTransfer(dst, [...a.selected], mode)
    },
    [active, applyTransfer, expandPane],
  )

  // Drag/drop: transfer dropped source paths into pane `id`'s current folder.
  const dropIntoPane = useCallback(
    (id: PaneId, srcPaths: string[], copy: boolean) => {
      const dst = (panesRef.current[id].path || '').replace(/\/+$/, '')
      if (!dst || !srcPaths.length) return
      // Ignore same-pane drops: every source already lives directly in `dst`.
      const parentOf = (p: string) => p.slice(0, p.lastIndexOf('/')) || '/'
      const norm = (p: string) => p.replace(/\/+$/, '') || '/'
      if (srcPaths.every((p) => norm(parentOf(p)) === norm(dst))) return
      void applyTransfer(dst, srcPaths, copy ? 'copy' : 'move')
    },
    [applyTransfer],
  )

  // Drop onto a specific folder (breadcrumb segment / Go-to item).
  const dropToDir = useCallback(
    (dir: string, srcPaths: string[], copy: boolean) => {
      if (!dir) return
      void applyTransfer(dir, srcPaths, copy ? 'copy' : 'move')
    },
    [applyTransfer],
  )

  // --- sidebar (pinned-sidebar change) ---
  const [sidebarAdd, setSidebarAdd] = useState<{ value: string } | null>(null)

  const openSidebarItem = useCallback(
    async (path: string) => {
      try {
        await listDir(path, hiddenVisible) // resolves → it's a folder
        await navigatePane(activeRef.current, path)
      } catch {
        try {
          await openPath(path) // not a directory → open the file
        } catch (err) {
          handleSetStatus(String(err), 'error')
        }
      }
    },
    [hiddenVisible, navigatePane, handleSetStatus],
  )

  const sidebarAddConfirm = useCallback(() => {
    const v = sidebarAdd?.value.trim()
    setSidebarAdd(null)
    if (v) setPinned((prev) => pinPath(prev, v))
  }, [sidebarAdd, setPinned])

  const toggleSidebar = useCallback(() => setSidebarOpen(!getAppConfig().sidebarOpen), [setSidebarOpen])

  const openContextMenu = useCallback(
    (id: PaneId, file: FileEntry, x: number, y: number, e: MouseEvent) => {
      e.stopPropagation()
      setActive(id)
      patch(id, (p) => (p.selected.has(file.path) ? p : { ...p, selected: new Set([file.path]), anchorPath: file.path }))
      setContextMenu({ x, y, paneId: id, kind: 'file', file })
    },
    [patch],
  )

  const openSidebarContext = useCallback(
    (e: { clientX: number; clientY: number; stopPropagation: () => void }, info: { path: string; label: string; fixed: boolean }) => {
      e.stopPropagation()
      setContextMenu({ x: e.clientX, y: e.clientY, kind: 'sidebar', ...info })
    },
    [],
  )

  const targetPaths = useMemo(() => {
    if (!contextMenu || contextMenu.kind !== 'file') return []
    const f = contextMenu.file
    const p = panes[contextMenu.paneId]
    return p.selected.has(f.path)
      ? sortEntries(p.entries).filter((e) => p.selected.has(e.path)).map((e) => e.path)
      : [f.path]
  }, [contextMenu, panes, sortEntries])

  const buildContextItems = useCallback(
    (file: FileEntry, paths: string[]): MenuItem[] => {
      const ext = (file.extension ?? '').toLowerCase()
      const IMG = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'bmp', 'tiff', 'svg']
      const MEDIA = ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg']
      const DOC = ['pdf', 'rtf', 'txt', 'md', 'doc', 'docx', 'pages']
      const ARCH = ['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar']
      const previewable = IMG.includes(ext) || MEDIA.includes(ext) || DOC.includes(ext)
      const isArchive = !file.isDir && ARCH.includes(ext)
      const multi = paths.length > 1
      const blockSys = cfg.guardSystemLocations && paths.some(isProtectedPath)

      const items: MenuItem[] = []
      const mi = (d: string) => (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={d} />
        </svg>
      )

      // Apri
      if (file.isDir && !multi) {
        items.push({ key: 'open', label: i18n.t('menu.openFolder'), icon: mi('M4 11l8-7 8 7M6 10v9h12v-9'), onSelect: () => navigate(file.path) })
      } else {
        items.push({
          key: 'open',
          label: multi ? i18n.t('menu.openMany', { count: paths.length }) : isArchive ? i18n.t('menu.extract') : i18n.t('menu.open'),
          icon: mi('M14 4h6v6M20 4l-9 9M10 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5'),
          onSelect: async () => {
            for (const p of paths) {
              try { await openPath(p) } catch (err) { handleSetStatus(String(err), 'error') }
            }
          },
        })
      }

      // Quick Look (solo file apribili singolarmente)
      if (!multi && previewable) {
        items.push({
          key: 'ql',
          label: i18n.t('menu.preview'),
          hint: i18n.t('ai.keySpace'),
          icon: mi('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4'),
          onSelect: async () => {
            try { await quickLook(file.path) } catch (err) { handleSetStatus(String(err), 'error') }
          },
        })
      }

      // Nuova cartella dentro (solo cartella singola)
      if (file.isDir && !multi) {
        items.push({ key: 'newf', label: i18n.t('menu.newFolderHere'), icon: mi('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7ZM12 11v5M9.5 13.5h5'), onSelect: async () => { setNewFolderName(''); await navigate(file.path); setShowNewFolder(true) } })
      }

      items.push({ key: 'sep1', separator: true, label: '' })

      // Finder
      items.push({
        key: 'finder',
        label: i18n.t('menu.reveal'),
        icon: mi('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4'),
        onSelect: async () => {
          try { await revealInFinder(file.path) } catch (err) { handleSetStatus(String(err), 'error') }
        },
      })

      // Copia percorso (copia agli appunti di sistema)
      items.push({
        key: 'copyloc',
        label: i18n.t('menu.copyPath'),
        icon: mi('M8 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z'),
        onSelect: () => {
          navigator.clipboard?.writeText(paths.join('\n')).then(
            () => handleSetStatus(i18n.t('status.pathCopied'), 'success', 2500),
            () => handleSetStatus(i18n.t('status.copyFailed'), 'error'),
          )
        },
      })

      items.push({ key: 'sep2', separator: true, label: '' })

      // Clipboard app
      items.push({ key: 'copy', label: i18n.t('menu.copy'), hint: '⌘C', icon: mi('M8 8h10v10H8zM6 16H4V6h10v2'), onSelect: () => handleCopyCut('copy') })
      items.push({ key: 'cut', label: i18n.t('menu.cut'), hint: '⌘X', icon: mi('M6 6l12 12M18 6L6 18'), onSelect: () => handleCopyCut('move') })
      items.push({ key: 'paste', label: i18n.t('menu.paste'), hint: '⌘V', disabled: !clip.paths.length, icon: mi('M9 4h6v3H9zM7 6h10v14H7z'), onSelect: () => handlePaste() })

      // Rinomina (solo singolo)
      items.push({ key: 'rename', label: i18n.t('menu.rename'), disabled: multi || blockSys, hint: blockSys ? i18n.t('menu.systemTag') : undefined, icon: mi('M4 20h4L18 10l-4-4L4 16v4Z'), onSelect: () => setRenamingPath(file.path) })

      // Copy/Move to… (transfer without navigating away)
      items.push({ key: 'copyto', label: i18n.t('menu.copyTo'), icon: mi('M8 8h10v10H8zM6 16H4V6h10v2'), onSelect: () => setTransferReq({ mode: 'copy', paths }) })
      items.push({ key: 'moveto', label: i18n.t('menu.moveTo'), disabled: blockSys, hint: blockSys ? i18n.t('menu.systemTag') : undefined, icon: mi('M5 12h14M13 6l6 6-6 6'), onSelect: () => setTransferReq({ mode: 'move', paths }) })

      // Pin / Unpin nella barra laterale
      const allPinned = paths.length > 0 && paths.every((p) => pinned.includes(p))
      items.push(
        allPinned
          ? { key: 'unpin', label: i18n.t('menu.unpin'), icon: mi('M12 17v5M8 4h8l-1 6 3 3v2H6v-2l3-3-1-6Z'), onSelect: () => setPinned((prev) => prev.filter((p) => !paths.includes(p))) }
          : { key: 'pin', label: i18n.t('menu.pin'), icon: mi('M12 17v5M8 4h8l-1 6 3 3v2H6v-2l3-3-1-6Z'), onSelect: () => setPinned((prev) => paths.reduce((a, p) => pinPath(a, p), prev)) },
      )

      items.push({ key: 'sep3', separator: true, label: '' })

      items.push({ key: 'airename', label: i18n.t('menu.aiRename'), icon: mi('M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2'), onSelect: () => ai.requestRename(selectedEntries) })
      items.push({ key: 'aiorganize', label: i18n.t('menu.aiOrganize'), icon: mi('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z'), onSelect: () => ai.requestOrganize(selectedEntries) })
      items.push({ key: 'aisummary', label: i18n.t('menu.aiSummarize'), icon: mi('M8 8h8M8 12h8M8 16h5'), onSelect: () => ai.requestSummarize(selectedEntries) })

      // Cestino
      items.push({
        key: 'trash',
        label: i18n.t('menu.moveToTrash'),
        hint: blockSys ? i18n.t('menu.systemTag') : '⌫',
        disabled: blockSys,
        danger: true,
        icon: mi('M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13'),
        onSelect: () => requestDelete(),
      })

      return items
    },
    [navigate, handleSetStatus, handleCopyCut, handlePaste, clip.paths.length, setRenamingPath, requestDelete, setTransferReq, ai, selectedEntries, pinned, setPinned, cfg.guardSystemLocations],
  )

  const buildSidebarItems = useCallback(
    (menu: { kind: 'place' | 'recent' | 'sidebar'; label: string; path: string }): MenuItem[] => {
      const mi = (d: string) => (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={d} />
        </svg>
      )
      const items: MenuItem[] = []

      items.push({ key: 'open', label: i18n.t('menu.open'), icon: mi('M4 11l8-7 8 7M6 10v9h12v-9'), onSelect: () => (menu.kind === 'sidebar' ? void openSidebarItem(menu.path) : navigate(menu.path)) })
      items.push({
        key: 'finder',
        label: i18n.t('menu.reveal'),
        icon: mi('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4'),
        onSelect: async () => {
          try { await revealInFinder(menu.path) } catch (err) { handleSetStatus(String(err), 'error') }
        },
      })
      if (menu.kind !== 'sidebar')
        items.push({
          key: 'newf',
          label: i18n.t('menu.newFolderHere'),
          icon: mi('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7ZM12 11v5M9.5 13.5h5'),
          onSelect: async () => { setNewFolderName(''); await navigate(menu.path); setShowNewFolder(true) },
        })
      items.push({
        key: 'copyloc',
        label: i18n.t('menu.copyPath'),
        icon: mi('M8 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z'),
        onSelect: () => {
          navigator.clipboard?.writeText(menu.path).then(
            () => handleSetStatus(i18n.t('status.pathCopied'), 'success', 2500),
            () => handleSetStatus(i18n.t('status.copyFailed'), 'error'),
          )
        },
      })

      // Azione specifica per tipo: solo i percorsi recenti sono rimovibili
      if (menu.kind === 'recent') {
        items.push({ key: 'sep', separator: true, label: '' })
        items.push({
          key: 'remove',
          label: i18n.t('menu.removeRecent'),
          danger: true,
          icon: mi('M6 6l12 12M18 6L6 18'),
          onSelect: () => {
            setRecents((prev) => prev.filter((p) => p !== menu.path))
            handleSetStatus(i18n.t('status.removedFromRecent'), 'success', 2500)
          },
        })
      }

      // Pin / Unpin nella barra laterale (toggle in base allo stato corrente)
      items.push({ key: 'sepPin', separator: true, label: '' })
      const isPinned = pinned.includes(menu.path)
      items.push(
        isPinned
          ? { key: 'unpin', label: i18n.t('menu.unpin'), icon: mi('M12 17v5M8 4h8l-1 6 3 3v2H6v-2l3-3-1-6Z'), onSelect: () => setPinned((prev) => unpinPath(prev, menu.path)) }
          : { key: 'pin', label: i18n.t('menu.pin'), icon: mi('M12 17v5M8 4h8l-1 6 3 3v2H6v-2l3-3-1-6Z'), onSelect: () => setPinned((prev) => pinPath(prev, menu.path)) },
      )

      return items
    },
    [navigate, openSidebarItem, handleSetStatus, setNewFolderName, setShowNewFolder, setRecents, pinned, setPinned],
  )

  const actionsFor = useCallback(
    (target: FileEntry | FileEntry[]): MenuItem[] => {
      const mi = (d: string) => (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={d} />
        </svg>
      )
      const list = Array.isArray(target) ? target : [target]
      if (list.length === 0) {
        return [
          { key: 'newf', label: i18n.t('menu.newFolder'), hint: '⌘N', icon: mi('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7ZM12 11v5M9.5 13.5h5'), onSelect: () => { setNewFolderName(''); setShowNewFolder(true) } },
          { key: 'term', label: i18n.t('launcher.openTerminal'), icon: mi('M4 17l6-5-6-5M12 19h8'), onSelect: () => handleOpenTerminalHere() },
          { key: 'copyloc', label: i18n.t('menu.copyPath'), icon: mi('M8 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z'), onSelect: () => navigator.clipboard?.writeText(currentPath).then(() => handleSetStatus(i18n.t('status.pathCopied'), 'success', 2500), () => handleSetStatus(i18n.t('status.copyFailed'), 'error')) },
        ]
      }
      return buildContextItems(list[0], list.map((f) => f.path))
    },
    [buildContextItems, handleOpenTerminalHere, handleSetStatus, currentPath, setNewFolderName, setShowNewFolder],
  )

  const widgetCtx: WidgetCtx = {
    currentPath,
    home,
    entries: visibleEntries,
    selectedEntries,
    clip,
    pasteInFlight,
    hiddenVisible,
    searchQuery,
    navigate,
    refresh: () => refresh(currentPath),
    setHiddenVisible,
    setSearchQuery,
    copyCut: handleCopyCut,
    paste: handlePaste,
    clearClipboard: handleClearClip,
    emptyTrash: handleEmptyTrash,
    openTerminalHere: handleOpenTerminalHere,
    setStatus: handleSetStatus,
    actionsFor,
    ai,
  }

  const handleSortChange = useCallback((key: SortKey) => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: key === 'modified' ? -1 : 1 },
    )
  }, [setSort])

  const scrollIntoView = useCallback((path: string) => {
    const el = document.querySelector<HTMLElement>(`[data-file-path="${CSS.escape(path)}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [])

  const moveSelection = useCallback(
    (delta: number) => {
      if (!visibleEntries.length) return
      const current = [...selected][0]
      let idx = current ? visibleEntries.findIndex((e) => e.path === current) : -1
      idx = Math.max(0, Math.min(visibleEntries.length - 1, idx + (idx < 0 ? 0 : delta)))
      const path = visibleEntries[idx].path
      patchActive((p) => ({ ...p, selected: new Set([path]), anchorPath: path }))
      scrollIntoView(path)
    },
    [visibleEntries, selected, scrollIntoView, patchActive],
  )

  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if (typing) return
      const meta = e.metaKey || e.ctrlKey
      const lower = e.key.toLowerCase()
      const controlFocused = !!(t && typeof t.closest === 'function' && t.closest('[data-bar-control]'))

      // Comandi con modificatore
      if (meta && e.key === 'ArrowLeft') {
        e.preventDefault()
        return await goBack()
      }
      if (meta && e.key === 'ArrowRight') {
        e.preventDefault()
        return await goForward()
      }
      if (meta && e.key === 'ArrowUp') {
        e.preventDefault()
        return await goUp()
      }
      if (meta && lower === 'r') {
        e.preventDefault()
        return await refresh(currentPath)
      }
      if (meta && lower === 'n') {
        e.preventDefault()
        setNewFolderName('')
        return setShowNewFolder(true)
      }
      if (meta && lower === 'a') {
        e.preventDefault()
        setSelected(new Set(visibleEntries.map((x) => x.path)))
        return
      }
      if (meta && e.shiftKey && lower === 'c') {
        e.preventDefault()
        return setChatOpen((o) => !o)
      }
      if (meta && lower === 'c' && selected.size) {
        e.preventDefault()
        return await handleCopyCut('copy')
      }
      if (meta && lower === 'x' && selected.size) {
        e.preventDefault()
        return await handleCopyCut('move')
      }
      if (meta && lower === 'v') {
        e.preventDefault()
        return await handlePaste()
      }
      if (meta && lower === 'd') {
        e.preventDefault()
        return await goUp()
      }
      if (meta && lower === 'l') {
        e.preventDefault()
        setPathDraft(currentPath)
        return setEditingPath(true)
      }
      if (meta && lower === 'b') {
        e.preventDefault()
        return toggleSidebar()
      }
      if (meta && (e.key === '1' || e.key === '2')) {
        e.preventDefault()
        return activatePane(e.key === '1' ? 'left' : 'right')
      }
      if (meta && (e.key === '\\' || e.code === 'Backslash')) {
        e.preventDefault()
        return toggleFocus()
      }
      if (meta && e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        return swapPanes()
      }
      if (meta && e.shiftKey && lower === 'o' && selected.size) {
        e.preventDefault()
        return sendToOtherPane(e.altKey ? 'copy' : 'move')
      }

      // Navigazione semplice (senza modificatori) — solo se nessun controllo della
      // barra è focato, così Space/Frecce non confliggono con i bottoni della dock.
      if (controlFocused) return
      if (e.key === 'Tab') {
        e.preventDefault()
        return activatePane(active === 'left' ? 'right' : 'left')
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        return moveSelection(1)
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        return moveSelection(-1)
      }
      if (e.key === 'Home') {
        e.preventDefault()
        return moveSelection(-Infinity)
      }
      if (e.key === 'End') {
        e.preventDefault()
        return moveSelection(Infinity)
      }
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        if (selected.size === 1) {
          const f = visibleEntries.find((x) => x.path === [...selected][0])
          if (f && !f.isDir) {
            try {
              await quickLook(f.path)
            } catch (err) {
              handleSetStatus(String(err), 'error')
            }
          }
        }
        return
      }
      if (e.key === 'Enter' && selected.size === 1) {
        e.preventDefault()
        const f = visibleEntries.find((x) => x.path === [...selected][0])
        if (f) return await onOpen(active, f)
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size) {
        e.preventDefault()
        return requestDelete()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowNewFolder(false)
        setShowDeleteConfirm(false)
        setRenamingPath(null)
        setSelected(new Set())
        return
      }
      if (lower === 'f' && !editingPath) {
        e.preventDefault()
        setPathDraft(currentPath)
        return setEditingPath(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    goBack,
    goForward,
    goUp,
    currentPath,
    visibleEntries,
    selected,
    editingPath,
    refresh,
    handleCopyCut,
    handlePaste,
    onOpen,
    moveSelection,
    handleSetStatus,
    requestDelete,
    active,
    swapPanes,
    sendToOtherPane,
    setSelected,
    setRenamingPath,
    toggleSidebar,
    activatePane,
    toggleFocus,
  ])

  const parts = currentPath.split('/').filter(Boolean).map((p, i) => ({
    label: p,
    path: '/' + currentPath.split('/').filter(Boolean).slice(0, i + 1).join('/'),
  }))
  const isRoot = currentPath === '/'

  const contextMenuItems = useMemo<MenuItem[]>(() => {
    if (!contextMenu) return []
    return contextMenu.kind === 'file'
      ? buildContextItems(contextMenu.file, targetPaths)
      : buildSidebarItems(contextMenu)
  }, [contextMenu, targetPaths, buildContextItems, buildSidebarItems])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-base-100 text-base-content">
      <div className="flex shrink-0 select-none items-center gap-1 border-b border-base-300 px-2 py-1.5">
        <ToolButton label={t('toolbar.back')} disabled={!backStack.length} onClick={() => goBack()}>
          <IconBack />
        </ToolButton>
        <ToolButton label={t('toolbar.forward')} disabled={!fwdStack.length} onClick={() => goForward()}>
          <IconFwd />
        </ToolButton>
        <ToolButton label={t('toolbar.up')} disabled={isRoot} onClick={() => goUp()}>
          <IconUp />
        </ToolButton>
        <ToolButton label={t('toolbar.home')} onClick={async () => {
          const h = home || (await homeDir())
          await navigate(h)
        }}>
          <IconHome />
        </ToolButton>
        <ToolButton label={t('toolbar.refresh')} onClick={() => refresh(currentPath)}>
          <IconRefresh />
        </ToolButton>

        <div className="mx-1 h-6 w-px bg-base-300" />

        <ToolButton label={t('toolbar.newFolder')} onClick={() => { setNewFolderName(''); setShowNewFolder(true) }}>
          <IconNewFolder />
        </ToolButton>
        <ToolButton
          label={t('toolbar.rename')}
          disabled={selected.size !== 1}
          onClick={() => setRenamingPath([...selected][0])}
        >
          <IconRename />
        </ToolButton>
        <ToolButton label={t('toolbar.trash')} disabled={!selected.size} onClick={() => requestDelete()}>
          <IconTrash />
        </ToolButton>
        <ToolButton label={t('toolbar.copy')} disabled={!selected.size} onClick={() => handleCopyCut('copy')}>
          <IconCopy />
        </ToolButton>
        <ToolButton label={t('toolbar.cut')} disabled={!selected.size} onClick={() => handleCopyCut('move')}>
          <IconCut />
        </ToolButton>
        <ToolButton label={t('toolbar.paste')} disabled={!clip.paths.length || !currentPath} onClick={handlePaste}>
          <IconPaste />
        </ToolButton>
        <ToolButton
          label={t('toolbar.reveal')}
          disabled={selected.size !== 1}
          onClick={async () => {
            const f = selectedEntries[0]
            if (f) {
              try {
                await revealInFinder(f.path)
              } catch (err) {
                handleSetStatus(String(err), 'error')
              }
            }
          }}
        >
          <IconFinder />
        </ToolButton>

        <div className="mx-1 h-6 w-px bg-base-300" />
        <ViewToggle view={view} onChange={setView} />
        <ToolButton label={t('toolbar.settings')} onClick={() => setSettingsOpen(true)}>
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.3 2h-4l-.3 2.5a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.3 2.5h4l.3-2.5a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" />
          </svg>
        </ToolButton>

        {clip.paths.length > 0 ? (
          <span
            className="flex items-center gap-1.5 text-xs text-base-content/60"
            title={clip.paths.join('\n')}
          >
            <span className="cursor-pointer hover:underline" onClick={handleClearClip} title={t('chip.clearTitle')}>
              {clip.operation === 'move' ? '✂' : '⧉'} {clip.paths.length} · {clip.operation === 'move' ? t('chip.move') : t('chip.copy')}
            </span>
          </span>
        ) : null}

        <div className="min-w-4 flex-1" />

        <div
          className={`flex h-7 min-w-56 max-w-md items-center truncate rounded-lg border border-base-300 bg-base-200 px-2 text-sm hover:border-base-content/30 ${
            !editingPath ? 'cursor-text' : ''
          }`}
          onClick={() => {
            setPathDraft(currentPath)
            setEditingPath(true)
          }}
          title={t('path.edit')}
        >
          {editingPath ? (
            <input
              autoFocus
              value={pathDraft}
              onChange={(e) => setPathDraft(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  await navigate(pathDraft || '/')
                } else if (e.key === 'Escape') {
                  setEditingPath(false)
                }
              }}
              onBlur={() => setEditingPath(false)}
              className="w-full select-text bg-transparent outline-none"
            />
          ) : (
            <div className="flex items-center gap-1 overflow-hidden whitespace-nowrap">
              {isRoot ? (
                <span className="text-base-content/60">/</span>
              ) : (
                parts.map((p, i) => (
                  <span key={p.path} className="flex items-center gap-1">
                    {i > 0 && <span className="text-base-content/60">/</span>}
                    <span
                      className="truncate rounded px-1 hover:bg-base-300"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(p.path)
                      }}
                    >
                      {p.label}
                    </span>
                  </span>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          open={sidebarOpen}
          home={home}
          pinned={pinned}
          width={cfg.sidebarWidth}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          onOpenItem={(p) => void openSidebarItem(p)}
          onDropToDir={(dir, paths, copy) => void applyTransfer(dir, paths, copy ? 'copy' : 'move')}
          onPinPaths={(paths) => setPinned((prev) => paths.reduce((acc, p) => pinPath(acc, p), prev))}
          onUnpin={(p) => setPinned((prev) => unpinPath(prev, p))}
          onReorder={(p, to) => setPinned((prev) => reorderPinned(prev, p, to))}
          onAdd={() => setSidebarAdd({ value: '' })}
          onRowContext={openSidebarContext}
        />
        {sidebarOpen && (
          <SplitHandle className="w-2 shrink-0" label={t('resize.title')} onPointerDown={startSidebarResize} />
        )}
        <div className="flex min-h-0 min-w-0 flex-1">
          {paneCollapsed.left ? (
            <PaneRail id="left" path={panes.left.path} home={home} active={active === 'left'} onExpand={activatePane} />
          ) : (
          <div className="flex min-w-0" style={{ flex: paneCollapsed.right ? 1 : splitPct }}>
            <FilePane
            id="left"
            pane={panes.left}
            files={viewFor('left')}
            active={active === 'left'}
            view={view}
            sort={sort}
            home={home}
            recents={recents}
            pinned={pinned}
            onActivate={activatePane}
            onCollapse={toggleCollapse}
            onNavigate={navigatePane}
            onItemClick={handleItemClick}
            onOpen={onOpen}
            onContextMenu={openContextMenu}
            onRenameConfirm={handleRename}
            onRenameCancel={() => patch(active, (p) => ({ ...p, renamingPath: null }))}
            onSortChange={handleSortChange}
            dragPayload={dragPayload}
            onDropTransfer={dropIntoPane}
            onDropToDir={dropToDir}
          />
          </div>
          )}
          {!paneCollapsed.left && !paneCollapsed.right && (
            <SplitHandle className="w-2 shrink-0" label={t('resize.title')} onPointerDown={startSplit} />
          )}
          {paneCollapsed.right ? (
            <PaneRail id="right" path={panes.right.path} home={home} active={active === 'right'} onExpand={activatePane} />
          ) : (
          <div className="flex min-h-0 min-w-0" style={{ flex: paneCollapsed.left ? 1 : 1 - splitPct }}>
          <FilePane
            id="right"
            pane={panes.right}
            files={viewFor('right')}
            active={active === 'right'}
            view={view}
            sort={sort}
            home={home}
            recents={recents}
            pinned={pinned}
            onActivate={activatePane}
            onCollapse={toggleCollapse}
            onNavigate={navigatePane}
            onItemClick={handleItemClick}
            onOpen={onOpen}
            onContextMenu={openContextMenu}
            onRenameConfirm={handleRename}
            onRenameCancel={() => patch(active, (p) => ({ ...p, renamingPath: null }))}
            onSortChange={handleSortChange}
            dragPayload={dragPayload}
            onDropTransfer={dropIntoPane}
             onDropToDir={dropToDir}
            />
          </div>
          )}
          </div>
        </div>

        <StatusBar ctx={widgetCtx} chatOpen={chatOpen} onChat={() => setChatOpen((o) => !o)} />
      <AiOverlay ai={ai} />
      <ChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        ai={chat}
        onCreatePlan={(text) => void handleCreatePlan(text)}
        onCancelPlan={cancelCreatePlan}
        canPlan={canPlan}
        planBusy={planBusy}
      />
      <PlanPanel ctrl={plan} onClose={plan.close} />
      {lastBatchId && (
        <div className="fixed bottom-12 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-base-300 bg-base-200 px-3 py-1.5 text-xs shadow-lg">
          <span>{t('plan.lastBatch')}</span>
          <button className="btn btn-primary btn-xs" onClick={() => void undoLastBatch()}>
            {t('plan.undoLast')}
          </button>
          <button className="btn btn-ghost btn-xs !min-h-0" aria-label={t('common.close')} onClick={dismissLastBatch}>
            ✕
          </button>
        </div>
      )}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {sidebarAdd && (
        <Modal title={t('sidebar.add')} onClose={() => setSidebarAdd(null)}>
          <input
            autoFocus
            value={sidebarAdd.value}
            onChange={(e) => setSidebarAdd({ value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sidebarAddConfirm()
              if (e.key === 'Escape') setSidebarAdd(null)
            }}
            placeholder={t('sidebar.addPlaceholder')}
            className="w-full rounded border border-base-300 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-primary"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button className="rounded-md px-3 py-1.5 text-sm text-base-content/60 hover:bg-base-200" onClick={() => setSidebarAdd(null)}>
              {t('common.cancel')}
            </button>
            <button className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-content hover:opacity-90" onClick={sidebarAddConfirm}>
              {t('sidebar.add')}
            </button>
          </div>
        </Modal>
      )}
      {transferReq && (
        <TransferPicker
          open
          mode={transferReq.mode}
          count={transferReq.paths.length}
          home={home}
          recents={recents}
          currentPath={currentPath}
          otherPanePath={panes[active === 'left' ? 'right' : 'left'].path}
          onClose={() => setTransferReq(null)}
          onConfirm={(dst) => void handleTransfer(dst)}
        />
      )}

      {showNewFolder && (
        <Modal title={t('modal.newFolderTitle')} onClose={() => setShowNewFolder(false)}>
          <input
            autoFocus
            placeholder={t('modal.newFolderPlaceholder')}
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter') {
                await handleNewFolder()
              } else if (e.key === 'Escape') {
                setShowNewFolder(false)
              }
            }}
            className="w-full rounded border border-base-300 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-primary"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setShowNewFolder(false)}
              className="rounded-md px-3 py-1.5 text-sm text-base-content/60 hover:bg-base-200:bg-base-300"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleNewFolder}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary"
            >
              {t('modal.create')}
            </button>
          </div>
        </Modal>
      )}

      {showDeleteConfirm && (
        <Modal title={t('modal.deleteTitle')} onClose={() => setShowDeleteConfirm(false)}>
          <p className="text-sm text-base-content/60">
            {t('modal.deleteBody', { count: selected.size })}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-md px-3 py-1.5 text-sm text-base-content/60 hover:bg-base-200:bg-base-300"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleDelete}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
            >
              {t('modal.deleteConfirm')}
            </button>
          </div>
        </Modal>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      {statusMessage && (
        <StatusMessage
          key={`${statusMessage.message}-${statusMessage.type}`}
          message={statusMessage.message}
          type={statusMessage.type}
          timeout={statusMessage.timeout}
        />
      )}

      {planEmpty && (
        <div className="fixed inset-x-0 top-4 z-[75] flex justify-center px-4" role="alert">
          <div className="alert alert-info alert-soft max-w-lg justify-between gap-4 shadow-lg">
            <span>{t('plan.empty')}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setPlanEmpty(false)}>
              {t('plan.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}