import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getAppConfig } from './settings/appConfig'
import type { PlanOp } from './ai/plan.js'

/** Destructive ops pass `allowSystem`: when the guard is on, protected macOS
 * system locations are refused authoritatively in Rust. */
const allowSystem = () => !getAppConfig().guardSystemLocations


export interface FileEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  modified: number
  extension: string | null
  tags?: FileTag[]
}

export interface FileTag { name: string; color: number }

export interface FileInfo {
  name: string
  path: string
  isDir: boolean
  size: number | null
  modified: number
  created: number | null
  permissions: string
  childCount: number | null
}

export interface ClipboardInfo {
  paths: string[]
  operation: string | null
}

export interface DiskSpace {
  totalBytes: number
  freeBytes: number
  usedBytes: number
  volumeName: string
}

type FileTagUpdate = { path: string; tags: FileTag[] }

/** Frontend wire contract for every command registered by Tauri. The check
 * script compares command names and argument keys with Rust registration and
 * function signatures. Wrappers below derive their result type from this map. */
export interface TauriCommandMap {
  list_dir: { args: { path: string; showHidden?: boolean }; result: FileEntry[] }
  home_dir: { args: {}; result: string }
  file_info: { args: { path: string }; result: FileInfo }
  get_file_tags: { args: { paths: string[] }; result: [string, FileTag[]][] }
  set_files_tags: { args: { updates: FileTagUpdate[]; allowSystem: boolean }; result: void }
  copy_file: { args: { src: string; dst: string; allowSystem: boolean }; result: void }
  move_file: { args: { src: string; dst: string; allowSystem: boolean }; result: void }
  rename: { args: { path: string; newName: string; allowSystem: boolean }; result: void }
  delete_to_trash: { args: { path: string; allowSystem: boolean }; result: void }
  trash_list: { args: {}; result: TrashItem[] }
  trash_restore: { args: { id: string }; result: string }
  trash_delete_forever: { args: { id: string }; result: void }
  trash_empty: { args: {}; result: void }
  create_folder: { args: { parent: string; name: string; allowSystem: boolean }; result: string }
  read_text_file: { args: { path: string }; result: string }
  reveal_in_finder: { args: { path: string }; result: void }
  open_path: { args: { path: string }; result: void }
  connect_smb: { args: { endpoint: string }; result: void }
  disconnect_volume: { args: { path: string }; result: void }
  quick_look: { args: { path: string }; result: void }
  disk_space: { args: { path: string }; result: DiskSpace }
  read_file_bytes: { args: { path: string }; result: string }
  zip_list: { args: { path: string }; result: ZipListing }
  zip_read: { args: { path: string; inner: string }; result: string }
  zip_extract: { args: { path: string; dest: string; entries: string[] | null }; result: ExtractReport }
  list_volumes: { args: {}; result: Volume[] }
  eject_volume: { args: { mount: string }; result: void }
  open_terminal: { args: { path: string }; result: void }
  transfer_items: { args: { paths: string[]; dstDir: string; mode: 'copy' | 'move'; allowSystem: boolean }; result: TransferResult }
  copy_paths: { args: { paths: string[] }; result: void }
  cut_paths: { args: { paths: string[] }; result: void }
  paste_paths: { args: { targetDir: string; allowSystem: boolean }; result: string[] }
  clipboard_info: { args: {}; result: ClipboardInfo }
  clear_clipboard: { args: {}; result: void }
  apply_plan: { args: { batchId: string; ops: ApplyPlanOp[]; allowSystem: boolean }; result: ApplyReport }
  undo_plan: { args: { batchId: string; allowSystem: boolean }; result: ApplyReport }
  gateway_base: { args: {}; result: string }
  ai_get_config: { args: {}; result: AiProviderInfo[] }
  ai_set_provider: { args: { id: string; baseUrl?: string; apiKey?: string }; result: void }
  ai_add_provider: { args: { id: string; baseUrl: string; apiKey?: string }; result: void }
  ai_remove_provider: { args: { id: string }; result: void }
  build_info: { args: {}; result: BuildInfo }
}

type CommandArgs<K extends keyof TauriCommandMap> = TauriCommandMap[K]['args']
type CommandResult<K extends keyof TauriCommandMap> = TauriCommandMap[K]['result']
type InvokeArguments<K extends keyof TauriCommandMap> = keyof CommandArgs<K> extends never
  ? []
  : [args: CommandArgs<K>]

export interface TauriCommandErrorShape {
  code: 'tauri_command_failed'
  command: string
  message: string
}

/** Stable rejection shape for Rust command errors and Tauri IPC failures. */
export class TauriCommandError extends Error implements TauriCommandErrorShape {
  readonly code = 'tauri_command_failed' as const
  readonly command: string

  constructor(command: string, message: string) {
    super(message)
    this.name = 'TauriCommandError'
    this.command = command
  }

  override toString(): string {
    // Keep existing user-facing `String(error)` call sites message-only.
    return this.message
  }
}

function invokeCommand<K extends keyof TauriCommandMap>(
  command: K,
  ...args: InvokeArguments<K>
): Promise<CommandResult<K>> {
  return invoke(command, (args[0] ?? {}) as Record<string, unknown>).catch((error: unknown) => {
    if (error instanceof TauriCommandError) throw error
    const message = error instanceof Error ? error.message : String(error)
    throw new TauriCommandError(command, message)
  }) as Promise<CommandResult<K>>
}

export const listDir = (path: string, showHidden?: boolean) =>
  invokeCommand('list_dir', { path, showHidden })
export const homeDir = () => invokeCommand('home_dir')
export const fileInfo = (path: string) => invokeCommand('file_info', { path })
export const getFileTags = (paths: string[]) => invokeCommand('get_file_tags', { paths })
export const setFilesTags = (updates: { path: string; tags: FileTag[] }[]) => invokeCommand('set_files_tags', { updates, allowSystem: allowSystem() })
export const copyFile = (src: string, dst: string) => invokeCommand('copy_file', { src, dst, allowSystem: allowSystem() })
export const moveFile = (src: string, dst: string) => invokeCommand('move_file', { src, dst, allowSystem: allowSystem() })
export const rename = (path: string, newName: string) =>
  invokeCommand('rename', { path, newName, allowSystem: allowSystem() })
export const deleteToTrash = (path: string) => invokeCommand('delete_to_trash', { path, allowSystem: allowSystem() })
export const createFolder = (parent: string, name: string) =>
  invokeCommand('create_folder', { parent, name, allowSystem: allowSystem() })
export const readFileBytes = (path: string) => invokeCommand('read_file_bytes', { path })
export const readTextFile = (path: string) => invokeCommand('read_text_file', { path })
export const revealInFinder = (path: string) => invokeCommand('reveal_in_finder', { path })
export const openPath = (path: string) => invokeCommand('open_path', { path })
export const connectSmb = (endpoint: string) => invokeCommand('connect_smb', { endpoint })
export const disconnectVolume = (path: string) => invokeCommand('disconnect_volume', { path })
export const quickLook = (path: string) => invokeCommand('quick_look', { path })
export const diskSpace = (path: string) => invokeCommand('disk_space', { path })

export interface Volume {
  name: string
  mountPoint: string
  device: string
  totalBytes: number
  usedBytes: number
  freeBytes: number
  /** Boot volume, network share (//host/share) or external disk/image. */
  kind: 'internal' | 'network' | 'external'
  ejectable: boolean
}
export interface ZipEntryInfo { name: string; isDir: boolean; size: number; modified: number }
export interface ZipListing { entries: ZipEntryInfo[]; truncated: boolean }
export interface ExtractReport { extracted: number; skipped: string[] }
export const zipList = (path: string) => invokeCommand('zip_list', { path })
export const zipRead = (path: string, inner: string) => invokeCommand('zip_read', { path, inner })
export const zipExtract = (path: string, dest: string, entries?: string[] | null) =>
  invokeCommand('zip_extract', { path, dest, entries: entries ?? null })

export const listVolumes = () => invokeCommand('list_volumes')
export const ejectVolume = (mount: string) => invokeCommand('eject_volume', { mount })
export const openTerminal = (path: string) => invokeCommand('open_terminal', { path })

export interface TrashItem {
  id: string
  originalPath: string
  deletedAt: number
  isDir: boolean
  size: number
  modified: number
}
export const trashList = () => invokeCommand('trash_list')
export const trashRestore = (id: string) => invokeCommand('trash_restore', { id })
export const trashDeleteForever = (id: string) => invokeCommand('trash_delete_forever', { id })
export const trashEmpty = () => invokeCommand('trash_empty')
export interface TransferFailure {
  src: string
  error: string
}
export interface TransferResult {
  applied: number
  failures: TransferFailure[]
  nonAtomic: boolean
}
export const transferItems = (paths: string[], dstDir: string, mode: 'copy' | 'move') =>
  invokeCommand('transfer_items', { paths, dstDir, mode, allowSystem: allowSystem() })
export const gatewayBase = () => invokeCommand('gateway_base')

export interface ApplyFailedOp { id: string; code: string; error: string }
export interface ApplyReport { applied: number; skipped: number; failed: ApplyFailedOp[]; batchId: string; total: number; durationMs: number; phaseCounts: Record<string, number> }
export interface PlanProgress { done: number; total: number; currentId: string }
export type ApplyPlanOp = PlanOp | { id: string; kind: 'createFile'; path: string; content: string; included: boolean }
export const applyPlan = (batchId: string, ops: ApplyPlanOp[]) =>
  invokeCommand('apply_plan', { batchId, ops, allowSystem: allowSystem() })
export const undoPlan = (batchId: string) =>
  invokeCommand('undo_plan', { batchId, allowSystem: allowSystem() })
export const onPlanProgress = (cb: (p: PlanProgress) => void) =>
  listen<PlanProgress>('plan-progress', (e) => cb(e.payload))

export interface BuildInfo { version: string; buildEpoch: number; commit: string; branch: string }
export const buildInfo = () => invokeCommand('build_info')

export interface AiProviderInfo {
  id: string
  baseUrl: string
  device: string
  hasKey: boolean
  keyPreview: string | null
  cloud: boolean
  builtin: boolean
}
export const aiGetConfig = () => invokeCommand('ai_get_config')
export const aiSetProvider = (id: string, baseUrl?: string, apiKey?: string) =>
  invokeCommand('ai_set_provider', { id, baseUrl, apiKey })
export const aiAddProvider = (id: string, baseUrl: string, apiKey?: string) =>
  invokeCommand('ai_add_provider', { id, baseUrl, apiKey })
export const aiRemoveProvider = (id: string) =>
  invokeCommand('ai_remove_provider', { id })

export const copyPaths = (paths: string[]) => invokeCommand('copy_paths', { paths })
export const cutPaths = (paths: string[]) => invokeCommand('cut_paths', { paths })
export const pastePaths = (targetDir: string) =>
  invokeCommand('paste_paths', { targetDir, allowSystem: allowSystem() })
export const getClipboard = () => invokeCommand('clipboard_info')
export const clearClipboard = () => invokeCommand('clear_clipboard')

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${units[i]}`
}

export function formatDate(secs: number): string {
  if (!secs) return '—'
  return new Date(secs * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function kindOf(entry: FileEntry): string {
  if (entry.isDir) return 'Folder'
  const ext = entry.extension?.toLowerCase()
  if (!ext) return 'File'
  const kinds: Record<string, string> = {
    png: 'PNG Image',
    jpg: 'JPEG Image',
    jpeg: 'JPEG Image',
    gif: 'GIF Image',
    webp: 'WebP Image',
    heic: 'HEIC Image',
    svg: 'SVG Image',
    pdf: 'PDF Document',
    txt: 'Text File',
    md: 'Markdown',
    json: 'JSON Data',
    yaml: 'YAML Data',
    yml: 'YAML Data',
    toml: 'TOML Config',
    ts: 'TypeScript',
    tsx: 'TypeScript',
    js: 'JavaScript',
    mjs: 'JavaScript',
    css: 'CSS Stylesheet',
    html: 'HTML Document',
    rs: 'Rust Source',
    go: 'Go Source',
    py: 'Python Source',
    sh: 'Shell Script',
    zip: 'Zip Archive',
    tar: 'Tar Archive',
    gz: 'GZ Archive',
    dmg: 'Disk Image',
    mp3: 'MP3 Audio',
    wav: 'WAV Audio',
    flac: 'FLAC Audio',
    m4a: 'M4A Audio',
    mp4: 'MP4 Video',
    mov: 'MOV Video',
    mkv: 'MKV Video',
    ppt: 'PowerPoint',
    pptx: 'PowerPoint',
    doc: 'Word Document',
    docx: 'Word Document',
    xls: 'Excel Spreadsheet',
    xlsx: 'Excel Spreadsheet',
  }
  return kinds[ext] ?? `${ext.toUpperCase()} File`
}
