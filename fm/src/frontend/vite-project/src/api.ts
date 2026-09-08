import { invoke } from '@tauri-apps/api/core'
import { getAppConfig } from './settings/appConfig'

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

export const listDir = (path: string, showHidden?: boolean) =>
  invoke<FileEntry[]>('list_dir', { path, showHidden })
export const homeDir = () => invoke<string>('home_dir')
export const copyFile = (src: string, dst: string) => invoke<void>('copy_file', { src, dst })
export const moveFile = (src: string, dst: string) => invoke<void>('move_file', { src, dst, allowSystem: allowSystem() })
export const rename = (path: string, newName: string) =>
  invoke<void>('rename', { path, newName, allowSystem: allowSystem() })
export const deleteToTrash = (path: string) => invoke<void>('delete_to_trash', { path, allowSystem: allowSystem() })
export const createFolder = (parent: string, name: string) =>
  invoke<string>('create_folder', { parent, name })
export const readTextFile = (path: string) => invoke<string>('read_text_file', { path })
export const writeTextFile = (path: string, content: string) =>
  invoke<void>('write_text_file', { path, content })
export const revealInFinder = (path: string) => invoke<void>('reveal_in_finder', { path })
export const openPath = (path: string) => invoke<void>('open_path', { path })
export const quickLook = (path: string) => invoke<void>('quick_look', { path })
export const diskSpace = (path: string) => invoke<DiskSpace>('disk_space', { path })
export const openTerminal = (path: string) => invoke<void>('open_terminal', { path })
export const emptyTrash = () => invoke<void>('empty_trash')

export interface TrashItem {
  id: string
  originalPath: string
  deletedAt: number
  isDir: boolean
  size: number
  modified: number
}
export const trashList = () => invoke<TrashItem[]>('trash_list')
export const trashRestore = (id: string) => invoke<string>('trash_restore', { id })
export const trashDeleteForever = (id: string) => invoke<void>('trash_delete_forever', { id })
export const trashEmpty = () => invoke<void>('trash_empty')
export interface TransferFailure {
  src: string
  error: string
}
export interface TransferResult {
  applied: number
  failures: TransferFailure[]
}
export const transferItems = (paths: string[], dstDir: string, mode: 'copy' | 'move') =>
  invoke<TransferResult>('transfer_items', { paths, dstDir, mode, allowSystem: allowSystem() })
export const gatewayBase = () => invoke<string>('gateway_base')

export interface BuildInfo { version: string; buildEpoch: number }
export const buildInfo = () => invoke<BuildInfo>('build_info')

export interface AiProviderInfo {
  id: string
  baseUrl: string
  hasKey: boolean
  keyPreview: string | null
}
export const aiGetConfig = () => invoke<AiProviderInfo[]>('ai_get_config')
export const aiSetProvider = (id: string, baseUrl?: string, apiKey?: string) =>
  invoke<void>('ai_set_provider', { id, baseUrl, apiKey })

export const copyPaths = (paths: string[]) => invoke<void>('copy_paths', { paths })
export const cutPaths = (paths: string[]) => invoke<void>('cut_paths', { paths })
export const pastePaths = (targetDir: string) =>
  invoke<string[]>('paste_paths', { targetDir, allowSystem: allowSystem() })
export const getClipboard = () => invoke<ClipboardInfo>('clipboard_info')
export const clearClipboard = () => invoke<void>('clear_clipboard')

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