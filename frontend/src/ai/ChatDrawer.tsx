import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { ChatController, ChatMessageState } from './useChat.js'
import { CANCELLED_SENTINEL, type ChatAction } from './chat.js'
import { Markdown } from './Markdown.js'

/** Errors that mean the model emitted an inline op the app structurally cannot
 *  perform (e.g. nested `create` for a `.keep`). The card is hidden and only
 *  counted, so the user isn't spammed with disabled "target outside current dir". */
export const SILENT_ISSUES: ReadonlySet<string> = new Set(['target outside current dir'])

export interface ChatDrawerProps {
  open: boolean
  embedded?: boolean
  showHeader?: boolean
  onClose: () => void
  ai: ChatController
  /** R8: 🪄 click only forwards the message content; App runs the plan pipeline. */
  onCreatePlan?: (text: string) => void
  /** R7: false when the active folder exceeds the hard cap (button disabled). */
  canPlan?: boolean
  /** True while a plan is being generated from a message (wand shows a spinner). */
  planBusy?: boolean
  /** Cancel the in-flight plan generation (wand becomes ⏹ while busy). */
  onCancelPlan?: () => void
  onOpenDebug?: () => void
  onOpenActivity?: () => void
  /** Live seconds elapsed since the plan generation started (0 while idle). */
  planElapsed?: number
}

/**
 * Right-side chat drawer (Task 5 of the AI chat plan). Consumes the Task-4
 * `useChat` controller. Nothing the model proposes executes until the user
 * confirms a specific action card (spec §6). Send is disabled while a turn is
 * streaming: `useChat.send` silently drops overlapping sends, so the UI must
 * not let the user start one (Task-4 residual finding).
 */
export function ChatDrawer({ open, embedded = false, showHeader = true, onClose, ai, onCreatePlan, canPlan = true, planBusy = false, onCancelPlan, onOpenDebug, onOpenActivity, planElapsed = 0 }: ChatDrawerProps) {
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
    <div className={embedded ? 'relative flex h-full w-full justify-end' : 'fixed inset-0 z-40 flex justify-end'}>
      {!embedded && <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />}
      <div
        className={`relative z-10 flex h-full ${embedded ? 'w-full' : 'w-[420px]'} flex-col border-l border-base-300 bg-base-100 shadow-2xl`}
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
        {showHeader && <div className="flex items-center justify-between border-b border-base-300 px-4 py-3">
          <span className="text-sm font-semibold">{t('chat.title')}</span>
          <div className="flex items-center gap-1">
            {(onOpenActivity || onOpenDebug) && (
              <button
                type="button"
                className="tooltip tooltip-left btn btn-ghost btn-xs gap-1 text-base-content/70 hover:text-primary"
                onClick={onOpenActivity ?? onOpenDebug}
                title={t('chat.activity')}
        data-tip={t('chat.activity')}
                aria-label={t('chat.activity')}
              >
                <span aria-hidden>◷</span>
                <span className="hidden sm:inline">{t('chat.activity')}</span>
              </button>
            )}
            <button className="tooltip tooltip-left btn btn-ghost btn-xs" onClick={onClose} aria-label={t('common.close')}
              title={t('common.close')}
        data-tip={t('common.close')}>✕</button>
          </div>
        </div>}

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
                {copied ? t('chat.copied') : t('ai.copy')}
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
              <MessageBubble
                m={m}
                onCreatePlan={onCreatePlan}
                canPlan={canPlan}
                busy={planBusy}
                planElapsed={planElapsed}
                onCancelPlan={onCancelPlan}
              />
              {m.actions
                ?.map((a, j) => ({ a, j, v: ai.validateAction(i, j) }))
                .filter((x) => !(x.v.ok === false && SILENT_ISSUES.has(x.v.error)))
                .map(({ a, j, v }) => (
                  <ActionCard
                    key={j}
                    a={a}
                    validation={v}
                    applied={m.actionsApplied?.[j]}
                    error={m.actionErrors?.[j]}
                    requiresPlan={v.ok && !!v.requiresPlan}
                    onApply={() => void ai.applyAction(i, j)}
                    onReviewPlan={() => void ai.applyAction(i, j)}
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

/**
 * One chat bubble. Assistant content renders as Markdown (GFM); user content
 * stays verbatim pre-wrapped. Own `copied` state so the per-message copy
 * button flips only the bubble it belongs to.
 */
function MessageBubble({
  m,
  onCreatePlan,
  canPlan = true,
  busy = false,
  planElapsed = 0,
  onCancelPlan,
}: {
  m: ChatMessageState
  onCreatePlan?: (text: string) => void
  canPlan?: boolean
  busy?: boolean
  planElapsed?: number
  onCancelPlan?: () => void
  onOpenDebug?: () => void
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const isUser = m.role === 'user'
  const wand = !isUser && !!onCreatePlan
  return (
    <span className="group inline-block max-w-[85%] text-left align-top">
      <span className={`block break-words rounded-2xl px-3 py-2 ${isUser ? 'bg-primary/10 whitespace-pre-wrap' : 'bg-base-200'}`}>
        {isUser ? m.content : <Markdown text={m.content} />}
        {m.streaming && <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-current" />}
      </span>
      {/* Per-message toolbar: always visible, at the END of the answer card. */}
      <span className="mt-0.5 flex items-center gap-0.5">
        {wand && (busy ? (
          <button
            data-bar-control
            className="tooltip tooltip-left btn btn-ghost btn-xs !min-h-0"
            title={t('plan.cancel')}
        data-tip={t('plan.cancel')}
            aria-label={t('plan.cancel')}
            onClick={() => onCancelPlan?.()}
          >
            <span className="loading loading-spinner loading-xs" />⏹
            <span className="ml-1 text-[10px] opacity-70">{planElapsed}s</span>
          </button>
        ) : (
          <button
            data-bar-control
            className="tooltip tooltip-left btn btn-ghost btn-xs !min-h-0"
            disabled={!canPlan || !!m.streaming}
            title={canPlan ? t('plan.createBtn') : t('plan.tooBig')}
        data-tip={canPlan ? t('plan.createBtn') : t('plan.tooBig')}
            aria-label={t('plan.createBtn')}
            onClick={() => onCreatePlan?.(m.content)}
          >
            🪄
          </button>
        ))}
        <button
          data-bar-control
          className={`btn btn-ghost btn-xs !min-h-0 ${copied ? 'text-success' : ''}`}
          onClick={async () => {
            try {
              await navigator.clipboard?.writeText(m.content)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            } catch {
              /* clipboard failed silently */
            }
          }}
        >
          {copied ? t('chat.copied') : t('ai.copy')}
        </button>
      </span>
    </span>
  )
}

function ActionCard({
  a,
  validation,
  applied,
  error,
  requiresPlan,
  onApply,
  onReviewPlan,
  onCancel,
}: {
  a: ChatAction
  validation: { ok: true; requiresPlan?: boolean } | { ok: false; error: string }
  applied?: boolean
  error?: string | null
  requiresPlan?: boolean
  onApply: () => void
  onReviewPlan: () => void
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
          {requiresPlan ? (
            <button className="btn btn-secondary btn-xs" disabled={blocked || !onReviewPlan} onClick={onReviewPlan}>
              {t('chat.workspace.reviewPlan')}
            </button>
          ) : (
            <button className="btn btn-primary btn-xs" disabled={blocked} onClick={onApply}>
              {t('common.apply')}
            </button>
          )}
          <button className="btn btn-ghost btn-xs" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </div>
      )}
    </div>
  )
}

function iconFor(type: ChatAction['type']): string {
  return { rename: '🔄', organize: '🗂️', createFolder: '📁', create: '✨', trash: '🗑️' }[type]
}

function describeAction(a: ChatAction): string {
  switch (a.type) {
    case 'rename':
      return `${a.file} → ${a.newName}`
    case 'organize':
      return `${a.file} → ${a.dstFolder}/`
    case 'createFolder':
      return a.folder
    case 'create':
      return a.file
    case 'trash':
      return a.file
  }
}
