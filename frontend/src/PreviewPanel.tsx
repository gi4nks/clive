/**
 * Right-hand preview panel (add-preview-panel): shows the last-clicked file of
 * the active pane's selection with kind-specific renderers, a multi-selection
 * summary strip, folder metadata, and a Quick Look fallback card.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { formatSize, openPath, quickLook, type FileEntry } from './api'
import { getChildCount } from './childCount'
import { previewErrorLabel, usePreview } from './preview'

const KIND_ICON: Record<string, string> = {
  image: '🖼', video: '🎬', audio: '🎵', pdf: '📄', markdown: '📝', text: '📃', folder: '📁', fallback: '❔',
}

export function PreviewPanel({
  selection,
  expanded = false,
  onToggleExpanded = () => undefined,
}: {
  selection: FileEntry[]
  expanded?: boolean
  onToggleExpanded?: () => void
}) {
  const { t } = useTranslation()
  const target = selection.length === 1 ? selection[0] : selection[selection.length - 1] ?? null
  const state = usePreview(
    target ? { path: target.path, name: target.name, isDir: target.isDir, size: target.size } : null,
  )
  const [childCount, setChildCount] = useState<number | null>(null)

  useEffect(() => {
    setChildCount(null)
    if (target?.isDir) {
      void getChildCount(target.path).then((v) => v.state === 'ok' && setChildCount(v.total)).catch(() => undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.path])

  return (
    <section
      data-preview-panel
      aria-label={t('preview.title')}
      className={`flex h-full min-h-0 min-w-0 flex-col border-l border-base-300 bg-base-100 ${expanded ? 'flex-1' : 'w-[22rem] shrink-0'}`}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-base-300 px-3 py-2">
        <span aria-hidden className="text-base">{KIND_ICON[state.kind] ?? '❔'}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium" title={state.name}>{state.name || t('preview.empty')}</div>
          <div className="truncate text-[11px] text-base-content/50">
            {state.kind === 'folder' && childCount !== null ? t('preview.items', { n: childCount }) : state.size > 0 ? formatSize(state.size) : ''}
          </div>
        </div>
        {selection.length > 1 && (
          <span className="badge badge-sm badge-ghost shrink-0">{t('preview.multiple', { n: selection.length })}</span>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-square shrink-0"
          aria-label={expanded ? t('preview.restoreSize') : t('preview.fillSpace')}
          title={expanded ? t('preview.restoreSize') : t('preview.fillSpace')}
          onClick={onToggleExpanded}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {expanded
              ? <path d="M8 4v4H4m12-4v4h4M4 16h4v4m12-4h-4v4" />
              : <path d="M4 8V4h4m8 0h4v4M20 16v4h-4M8 20H4v-4" />}
          </svg>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {!target && <div className="flex h-full items-center justify-center text-xs text-base-content/40">{t('preview.noSelection')}</div>}
        {target && state.error === 'loading' && <div className="skeleton h-24 w-full rounded-lg" />}
        {target && state.kind === 'image' && state.url && (
          <img src={state.url} alt={state.name} className="mx-auto max-h-full max-w-full rounded-lg object-contain" />
        )}
        {target && state.kind === 'video' && state.url && <video src={state.url} controls className="w-full rounded-lg" />}
        {target && state.kind === 'audio' && state.url && <audio src={state.url} controls className="mt-6 w-full" />}
        {target && state.kind === 'pdf' && state.url && <iframe title={state.name} src={state.url} className="h-full w-full rounded-lg border border-base-300" />}
        {target && state.kind === 'markdown' && state.text !== null && (
          <div className="prose prose-sm max-w-none px-1 text-[13px] dark:prose-invert">
            <Markdown remarkPlugins={[remarkGfm]}>{state.text}</Markdown>
            {state.truncated && <p className="text-xs opacity-50">{t('preview.truncated')}</p>}
          </div>
        )}
        {target && state.kind === 'text' && state.text !== null && (
          <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-snug">
            {state.text}
            {state.truncated && <span className="block opacity-50">{t('preview.truncated')}</span>}
          </pre>
        )}
        {target && (state.kind === 'folder' || state.kind === 'fallback') && (
          <div className="flex flex-col items-stretch gap-2 rounded-lg border border-base-300 p-3 text-center" data-preview-fallback>
            <span aria-hidden className="text-4xl">{state.kind === 'folder' ? '📁' : KIND_ICON.fallback}</span>
            <div className="text-sm font-medium">{state.name}</div>
            {previewErrorLabel(state.error, t, state.size) && <div className="text-xs text-warning">{previewErrorLabel(state.error, t, state.size)}</div>}
            <div className="mt-1 flex justify-center gap-2">
              <button className="btn btn-sm btn-outline" onClick={() => void quickLook(target.path).catch(() => undefined)}>
                {t('preview.quickLook')}
              </button>
              <button className="btn btn-sm btn-primary" onClick={() => void openPath(target.path).catch(() => undefined)}>
                {t('preview.open')}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
