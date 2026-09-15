/**
 * Preview pipeline (add-preview-panel): classify the selected file, load its
 * bytes/text through the Rust commands (never the asset protocol), and manage
 * the single blob-URL slot (revoke on change/unmount). Pure helpers are
 * exported for tests.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatSize, readFileBytes, readTextFile, zipRead } from './api'
import { splitArchivePath } from './archivePath'

export type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'markdown' | 'text' | 'folder' | 'fallback'

const EXT_KIND: Record<string, PreviewKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image',
  heic: 'image', heif: 'image', bmp: 'image', tiff: 'image', tif: 'image', avif: 'image',
  mp4: 'video', mov: 'video', m4v: 'video', webm: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', ogg: 'audio', flac: 'audio',
  pdf: 'pdf',
  md: 'markdown', markdown: 'markdown',
  txt: 'text', log: 'text', json: 'text', csv: 'text', tsv: 'text', xml: 'text', yml: 'text', yaml: 'text',
  toml: 'text', ini: 'text', env: 'text', conf: 'text', rs: 'text', ts: 'text', tsx: 'text', js: 'text',
  jsx: 'text', css: 'text', html: 'text', py: 'text', sh: 'text', zsh: 'text', go: 'text', java: 'text',
  c: 'text', h: 'text', cpp: 'text', swift: 'text', rb: 'text', sql: 'text',
}

const extOf = (name: string): string => {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toLowerCase() : ''
}

export function previewKind(name: string, isDir = false): PreviewKind {
  if (isDir) return 'folder'
  return EXT_KIND[extOf(name)] ?? 'fallback'
}

/** Kinds whose bytes go through read_file_bytes. */
export const usesBytes = (k: PreviewKind): boolean => k === 'image' || k === 'video' || k === 'audio' || k === 'pdf'
/** Kinds loaded as (truncated) text. */
export const usesText = (k: PreviewKind): boolean => k === 'text' || k === 'markdown'

export const TEXT_LINE_CAP = 5000

export function truncateLines(text: string, cap = TEXT_LINE_CAP): { text: string; truncated: boolean } {
  const lines = text.split('\n')
  if (lines.length <= cap) return { text, truncated: false }
  return { text: lines.slice(0, cap).join('\n'), truncated: true }
}

/** Monotonic token so stale async loads cannot overwrite newer ones. */
export function newLoadToken(ref: { current: number }): number {
  ref.current += 1
  return ref.current
}

export interface PreviewState {
  path: string | null
  name: string
  kind: PreviewKind
  size: number
  url: string | null
  text: string | null
  truncated: boolean
  error: 'loading' | 'too-large' | 'unreadable' | null
}

const emptyState: PreviewState = { path: null, name: '', kind: 'fallback', size: 0, url: null, text: null, truncated: false, error: null }

const MIME: Partial<Record<PreviewKind, string>> = {
  image: 'image/*', video: 'video/*', audio: 'audio/*', pdf: 'application/pdf',
}

function b64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime === 'image/*' ? 'image/png' : mime === 'video/*' ? 'video/mp4' : mime === 'audio/*' ? 'audio/mp4' : 'application/pdf' })
}

export interface PreviewTarget {
  path: string
  name: string
  isDir: boolean
  size: number
}

/**
 * Debounced, revoking preview loader for one target (null = nothing/invalid
 * selection → empty state). Callers pass the last-clicked entry of the active
 * pane's selection.
 */
export function usePreview(target: PreviewTarget | null): PreviewState {
  const [state, setState] = useState<PreviewState>(emptyState)
  const tokenRef = useRef(0)
  const urlRef = useRef<string | null>(null)
  const timerRef = useRef<number | null>(null)

  const load = useCallback((t: PreviewTarget) => {
    const token = newLoadToken(tokenRef)
    const kind = previewKind(t.name, t.isDir)
    const swap = (next: PreviewState) => {
      if (token !== tokenRef.current) return
      if (urlRef.current && urlRef.current !== next.url) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
      if (next.url) urlRef.current = next.url
      setState(next)
    }
    swap({ ...emptyState, path: t.path, name: t.name, kind, size: t.size, error: 'loading' })
    if (kind === 'folder' || kind === 'fallback') {
      swap({ ...emptyState, path: t.path, name: t.name, kind, size: t.size, error: null })
      return
    }
    if (usesText(kind)) {
      const arcT = splitArchivePath(t.path)
      const textP: Promise<string> = arcT
        ? zipRead(arcT.archive, arcT.inner).then((b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))))
        : readTextFile(t.path)
      textP
        .then((raw) => {
          const { text, truncated } = truncateLines(raw)
          swap({ ...emptyState, path: t.path, name: t.name, kind, size: t.size, text, truncated, error: null })
        })
        .catch(() => swap({ ...emptyState, path: t.path, name: t.name, kind: 'fallback', size: t.size, error: 'unreadable' }))
      return
    }
    const arcB = splitArchivePath(t.path)
    const bytesP = arcB ? zipRead(arcB.archive, arcB.inner) : readFileBytes(t.path)
    bytesP
      .then((b64) => {
        const url = URL.createObjectURL(b64ToBlob(b64, MIME[kind] ?? 'application/octet-stream'))
        swap({ ...emptyState, path: t.path, name: t.name, kind, size: t.size, url, error: null })
      })
      .catch((e: unknown) =>
        swap({
          ...emptyState, path: t.path, name: t.name, kind: 'fallback', size: t.size,
          error: String(e).startsWith('too-large') ? 'too-large' : 'unreadable',
        }),
      )
  }, [])

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    if (!target) {
      tokenRef.current += 1 // invalidate in-flight loads
      setState({ ...emptyState })
      return
    }
    timerRef.current = window.setTimeout(() => load(target), 180)
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.path])

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
  }, [])

  return state
}

export function previewErrorLabel(err: PreviewState['error'], t: (k: string, o?: Record<string, unknown>) => string, size?: number): string {
  if (err === 'too-large') return t('preview.tooLarge', { size: size !== undefined ? formatSize(size) : '' })
  if (err === 'unreadable') return t('preview.unreadable')
  return ''
}
