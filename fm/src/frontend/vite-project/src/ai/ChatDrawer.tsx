import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { ChatController } from './useChat.js'
import { CANCELLED_SENTINEL, type ChatAction } from './chat.js'

/**
 * Right-side chat drawer (Task 5 of the AI chat plan). Consumes the Task-4
 * `useChat` controller. Nothing the model proposes executes until the user
 * confirms a specific action card (spec §6). Send is disabled while a turn is
 * streaming: `useChat.send` silently drops overlapping sends, so the UI must
 * not let the user start one (Task-4 residual finding).
 */
export function ChatDrawer({ open, onClose, ai }: { open: boolean; onClose: () => void; ai: ChatController }) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [copied, setCopied] = useState(false)
  const [dragging, setDragging] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // jsdom has no scrollIntoView; guard the call so render tests don't throw.
    const el = endRef.current
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth' })
  }, [ai.messages, open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const submit = () => {
    const text = input.trim()
    if (!text || ai.streaming) return
    setInput('')
    void ai.send(text)
  }

  // Tauri exposes the absolute path on dropped File objects (window has
  // dragDropEnabled:false, so HTML5 DnD reaches the webview). Tests / plain
  // browsers have no File.path — fall back to a /drop/ pseudo-path.
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    for (const f of Array.from(e.dataTransfer.files)) {
      const path = (f as unknown as { path?: string }).path ?? `/drop/${f.name}`
      ai.addFile({
        name: f.name,
        path,
        isDir: false,
        size: f.size,
        modified: f.lastModified,
        extension: f.name.includes('.') ? f.name.slice(f.name.lastIndexOf('.') + 1) : null,
      })
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        className="relative z-10 flex h-full w-[420px] flex-col border-l border-base-300 bg-base-100 shadow-2xl"
        data-testid="chat-drop-target"
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-l-xl border-2 border-dashed border-primary bg-primary/5 text-xs font-semibold text-primary">
            {t('chat.dropHint')}
          </div>
        )}
        <div className="flex items-center justify-between border-b border-base-300 px-4 py-3">
          <span className="text-sm font-semibold">{t('chat.title')}</span>
          <button className="btn btn-ghost btn-xs" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>

        {ai.historyTruncated && (
          <div className="mx-3 mt-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] text-warning">
            ⚠ {t('chat.truncated')}
          </div>
        )}

        <div className="scroll-area flex-1 overflow-y-auto p-3 text-sm">
          {ai.error && (
            <div className="mb-2 flex items-start gap-2 rounded-md border border-error/40 bg-error/10 p-2 text-xs text-error">
              <span aria-hidden>⚠️</span>
              <span className="min-w-0 flex-1 break-words">{ai.error}</span>
              <button
                className={`btn btn-ghost btn-xs shrink-0 ${copied ? 'text-success' : ''} !min-h-0`}
                onClick={async () => {
                  try {
                    await navigator.clipboard?.writeText(ai.error)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  } catch {
                    /* clipboard failed silently */
                  }
                }}
              >
                {copied ? 'Copiato!' : t('ai.copy')}
                <span className="ml-1 text-xs opacity-80">↻</span>
              </button>
            </div>
          )}
          {ai.messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center opacity-60">
              <span className="text-3xl">💬</span>
              <span>{t('chat.empty')}</span>
            </div>
          )}
          {ai.messages.map((m, i) => (
            <div key={i} className={`mb-2 ${m.role === 'user' ? 'text-right' : ''}`}>
              <div className={`inline-block max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 ${m.role === 'user' ? 'bg-primary/10' : 'bg-base-200'}`}>
                {m.content}
                {m.streaming && <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-current" />}
              </div>
              {m.actions?.map((a, j) => (
                <ActionCard
                  key={j}
                  a={a}
                  validation={ai.validateAction(i, j)}
                  applied={m.actionsApplied?.[j]}
                  error={m.actionErrors?.[j]}
                  onApply={() => void ai.applyAction(i, j)}
                  onCancel={() => ai.cancelAction(i, j)}
                />
              ))}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {ai.addedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1 border-t border-base-300 p-2">
            {ai.addedFiles.map((f) => (
              <span key={f.path} className="badge badge-outline badge-sm gap-1">
                {f.name}
                <button onClick={() => ai.removeAdded(f.path)} aria-label={t('chat.removeFile')}>×</button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 border-t border-base-300 p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={t('chat.placeholder')}
            rows={2}
            className="textarea textarea-sm textarea-bordered flex-1"
            disabled={ai.streaming}
            aria-label={t('chat.placeholder')}
          />
          <button
            className="btn btn-primary btn-sm self-end"
            disabled={ai.streaming || !input.trim()}
            onClick={submit}
          >
            {t('chat.send')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ActionCard({
  a,
  validation,
  applied,
  error,
  onApply,
  onCancel,
}: {
  a: ChatAction
  validation: { ok: true } | { ok: false; error: string }
  applied?: boolean
  error?: string | null
  onApply: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const label = t(`chat.action.${a.type}`)
  const summary = describeAction(a)
  const isApplied = !!applied && !error
  const isCancelled = !!applied && error === CANCELLED_SENTINEL
  const blocked = !validation.ok && !isApplied && !isCancelled
  return (
    <div className="mt-1 rounded-lg border border-base-300 bg-base-200/50 p-2 text-xs">
      <div className="mb-1 font-semibold">
        {iconFor(a.type)} {label}
      </div>
      <div className="mb-1 break-words opacity-80">{summary}</div>
      {isApplied && <div className="text-success">✓ {t('chat.applied')}</div>}
      {isCancelled && <div className="opacity-60">— {t('chat.cancelled')}</div>}
      {blocked && <div className="mb-1 text-warning">{validation.error}</div>}
      {!blocked && !isApplied && !isCancelled && error && <div className="mb-1 text-error">{error}</div>}
      {!isApplied && !isCancelled && (
        <div className="flex gap-1">
          <button className="btn btn-primary btn-xs" disabled={blocked} onClick={onApply}>
            {t('common.apply')}
          </button>
          <button className="btn btn-ghost btn-xs" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </div>
      )}
    </div>
  )
}

function iconFor(type: ChatAction['type']): string {
  return { rename: '🔄', organize: '📁', create: '✨', trash: '🗑️' }[type]
}

function describeAction(a: ChatAction): string {
  switch (a.type) {
    case 'rename':
      return `${a.file} → ${a.newName}`
    case 'organize':
      return `${a.file} → ${a.dstFolder}/`
    case 'create':
      return a.file
    case 'trash':
      return a.file
  }
}
