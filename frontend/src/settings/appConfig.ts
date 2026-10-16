/**
 * Central application configuration — the single source of truth for all
 * persisted preferences (task: settings-page).
 *
 * Sync layer: an in-memory snapshot backed by `localStorage['fm.config']` so
 * React can read it instantly (and so the app still works where the native
 * store isn't available, e.g. tests/browser). Async layer: when the Tauri
 * `plugin-store` is reachable, the same object is mirrored to `settings.json`
 * (atomic file). On first run, values are seeded from the legacy `fm.*` keys.
 */
import { useSyncExternalStore } from 'react'
import type { SortState } from '../FileList'

export type Language = 'en' | 'it'

/** A local path managed by a sync client (for example Synology Drive). */
export interface RemoteLocation {
  id: string
  name: string
  path: string
  kind: 'local-sync' | 'smb'
  /** smb:// endpoint; credentials are handled by macOS, never stored here. */
  endpoint?: string
}

export interface AppConfig {
  language: Language
  theme: string // '' = follow system
  view: 'list' | 'grid'
  sort: SortState
  hiddenVisible: boolean
  confirmDestructive: boolean
  guardSystemLocations: boolean
  /** Right-hand file preview column (add-preview-panel). */
  previewPanel: boolean
  /** List-view column widths (px), per pane. Name & Size fixed; Date flexible. */
  colWidths: { left: { name: number; size: number }; right: { name: number; size: number } }
  sidebarWidth: number
  sidebarOpen: boolean
  /** Dual-pane collapse: each pane can be a thin rail; never both. */
  paneCollapsed: { left: boolean; right: boolean }
  pinned: string[] // pinned absolute paths (folders or files), display order
  remoteLocations: RemoteLocation[]
  home: string
  recents: string[]
  ai: {
    enabled: boolean
    provider: string
    model: string
    cloudOptIn: boolean
  }
}

export const DEFAULT_CONFIG: AppConfig = {
  language: 'en',
  theme: '',
  view: 'list',
  sort: { key: 'name', dir: 1 },
  hiddenVisible: false,
  confirmDestructive: true,
  previewPanel: false,
  guardSystemLocations: true,
  colWidths: { left: { name: 280, size: 120 }, right: { name: 280, size: 120 } },
  sidebarWidth: 200,
  sidebarOpen: true,
  paneCollapsed: { left: false, right: false },
  pinned: [],
  remoteLocations: [],
  home: '',
  recents: [],
  // No shipped provider/model: empty means "auto-select the first online
  // provider" (resolved by the AI layer against the gateway registry).
  ai: { enabled: true, provider: '', model: '', cloudOptIn: true },
}

const LS_KEY = 'fm.config'

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function readJSON<T>(key: string, fallback: T): T {
  return safeParse(localStorage.getItem(key), fallback)
}

/** Fill any missing keys from defaults (import robustness + forward-compat). */
export function normalizeConfig(v: Partial<AppConfig> | null | undefined): AppConfig {
  const base = { ...DEFAULT_CONFIG, ...(v ?? {}) }
  return {
    ...base,
    sort: { ...DEFAULT_CONFIG.sort, ...(v?.sort ?? {}) },
    ai: { ...DEFAULT_CONFIG.ai, ...(v?.ai ?? {}) },
    colWidths: {
      left: {
        name: typeof v?.colWidths?.left?.name === 'number' ? v.colWidths.left.name : DEFAULT_CONFIG.colWidths.left.name,
        size: typeof v?.colWidths?.left?.size === 'number' ? v.colWidths.left.size : DEFAULT_CONFIG.colWidths.left.size,
      },
      right: {
        name: typeof v?.colWidths?.right?.name === 'number' ? v.colWidths.right.name : DEFAULT_CONFIG.colWidths.right.name,
        size: typeof v?.colWidths?.right?.size === 'number' ? v.colWidths.right.size : DEFAULT_CONFIG.colWidths.right.size,
      },
    },
    paneCollapsed: {
      left: typeof v?.paneCollapsed?.left === 'boolean' ? v.paneCollapsed.left : false,
      right: typeof v?.paneCollapsed?.right === 'boolean' ? v.paneCollapsed.right : false,
    },
    sidebarOpen: typeof base.sidebarOpen === 'boolean' ? base.sidebarOpen : true,
    guardSystemLocations: typeof base.guardSystemLocations === 'boolean' ? base.guardSystemLocations : true,
    pinned: Array.isArray(base.pinned) ? base.pinned.filter((p) => typeof p === 'string') : [],
    remoteLocations: Array.isArray(base.remoteLocations)
      ? base.remoteLocations.filter((r): r is RemoteLocation =>
        !!r && typeof r === 'object' && typeof r.id === 'string' && typeof r.name === 'string' &&
        typeof r.path === 'string' && (r.kind === 'local-sync' || r.kind === 'smb') &&
        (r.endpoint === undefined || typeof r.endpoint === 'string'))
      : [],
    recents: Array.isArray(base.recents) ? base.recents : [],
  }
}

/** Seed from the legacy `fm.*` keys so existing users keep their settings. */
function seedFromLegacy(): AppConfig {
  const merged = normalizeConfig(safeParse<AppConfig | null>(localStorage.getItem(LS_KEY), null))
  if (localStorage.getItem(LS_KEY)) return merged
  const lang = (localStorage.getItem('fm.lang') as Language) || DEFAULT_CONFIG.language
  return normalizeConfig({
    language: lang,
    theme: localStorage.getItem('fm.theme') ?? DEFAULT_CONFIG.theme,
    view: readJSON<'list' | 'grid'>('fm.view', DEFAULT_CONFIG.view),
    sort: readJSON<SortState>('fm.sort', DEFAULT_CONFIG.sort),
    sidebarWidth: readJSON<number>('fm.sidebar.width', DEFAULT_CONFIG.sidebarWidth),
    recents: readJSON<string[]>('fm.recents', DEFAULT_CONFIG.recents),
    home: localStorage.getItem('fm.home') ?? DEFAULT_CONFIG.home,
    hiddenVisible: localStorage.getItem('fm.hidden') === '1',
    ai: {
      enabled: DEFAULT_CONFIG.ai.enabled,
      provider: readJSON<{ provider?: string }>('fm.ai.settings', {}).provider ?? DEFAULT_CONFIG.ai.provider,
      model: readJSON<{ model?: string }>('fm.ai.settings', {}).model ?? DEFAULT_CONFIG.ai.model,
      cloudOptIn: DEFAULT_CONFIG.ai.cloudOptIn,
    },
  })
}

let state: AppConfig = seedFromLegacy()
const listeners = new Set<() => void>()
type StoreHandle = { get: (k: string) => Promise<unknown>; set: (k: string, v: unknown) => Promise<void>; save: () => Promise<void> }
let store: StoreHandle | null | undefined

async function getStore(): Promise<StoreHandle | null> {
  if (store !== undefined) return store
  try {
    const mod = await import('@tauri-apps/plugin-store')
    const s = await mod.load('settings.json', { autoSave: true })
    store = { get: (k) => s.get(k), set: (k, v) => s.set(k, v), save: () => s.save() }
  } catch {
    store = null // native store unavailable → localStorage only
  }
  return store
}

function emit() {
  for (const l of listeners) l()
}

export function getAppConfig(): AppConfig {
  return state
}

function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
  } catch {
    /* storage full/blocked — in-memory still valid */
  }
  void getStore().then((s) => s?.set('config', state).catch(() => undefined))
}

/** A patch where nested `ai` may be partial (merged one level deep). */
export type ConfigPatch = Omit<Partial<AppConfig>, 'ai'> & { ai?: Partial<AppConfig['ai']> }

/** Shallow-merge a patch (ai is deep-merged one level). Returns new config. */
export function setAppConfig(patch: ConfigPatch): AppConfig {
  state = normalizeConfig({ ...state, ...patch, ai: { ...state.ai, ...(patch.ai ?? {}) } })
  persist()
  emit()
  return state
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Hydrate from the native store if it has newer data; otherwise push the seed. */
export async function initAppConfig(): Promise<void> {
  const s = await getStore()
  if (!s) return
  try {
    const remote = (await s.get('config')) as Partial<AppConfig> | null
    if (remote && Object.keys(remote).length) {
      state = normalizeConfig(remote)
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(state))
      } catch {
        /* ignore */
      }
      emit()
    } else {
      await s.set('config', state)
    }
  } catch {
    /* ignore; localStorage remains the source */
  }
}

// ---- typed selectors used by features ----
export function getLanguage(): Language {
  return state.language
}
export function setLanguage(l: Language): void {
  setAppConfig({ language: l })
}
export function getHome(): string {
  return state.home
}

/** React hook: re-renders subscribers on any config change. */
export function useAppConfig(): [AppConfig, (patch: ConfigPatch) => void] {
  const cfg = useSyncExternalStore(subscribe, getAppConfig, getAppConfig)
  return [cfg, setAppConfig]
}

/** Export/Import/Reset (task 5). */
export function exportConfig(): string {
  return JSON.stringify(state, null, 2)
}

export function importConfig(json: string): { ok: boolean; error?: string } {
  try {
    const parsed = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return { ok: false, error: 'Oggetto non valido' }
    setAppConfig(parsed as Partial<AppConfig>)
    return { ok: true }
  } catch {
    return { ok: false, error: 'JSON non valido' }
  }
}

export function resetConfig(): AppConfig {
  return setAppConfig({ ...DEFAULT_CONFIG })
}
