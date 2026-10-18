/**
 * Chat controller hook (Task 4 of the AI chat plan). Wires the pure chat layer
 * (`chat.ts` parser/validator/prompt builder) to real streaming via
 * `runtime.streamChat` and to filesystem mutations via the Rust proposal batch. Nothing
 * the model proposes executes until the user confirms a specific action card.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileEntry } from '../api.js'
import { budgetFiles, renderBudgeted, renderDirListing } from './budget.js'
import { buildChatPrompt, extractActions, validateChatAction, CANCELLED_SENTINEL, type ChatMessage } from './chat.js'
import i18n from '../i18n'
import { isImageName, modelCapabilities, visionGate } from './capabilities.js'
import { collectFileContents } from './fs.js'
import { streamChat, type AiFinishMeta, type StreamArgs } from './runtime.js'
import { addDebugEvent, addDebugLog, updateDebugLog } from './usePlanDebug.js'
import { proposalFromChatActions } from './proposal.js'
import { useAiProposal } from './useAiProposal.js'
import { snapshotContext, type AiContextSnapshot } from './context.js'
import type { LocationDescriptor } from '../location.js'
import { getAppConfig } from '../settings/appConfig.js'

export interface UseChatDeps {
  enabled?: boolean
  currentPath: string
  entries: FileEntry[]
  selected: FileEntry[]
  model: string
  guardOn: boolean
  location?: LocationDescriptor
  setStatus: (msg: string, kind: 'success' | 'error' | 'info') => void
  refresh: () => void
  /** Injected so tests can fake the model; production uses the real streamChat. */
  streamChat?: (args: StreamArgs) => AsyncGenerator<string, void, unknown>
}

export interface ChatMessageState extends ChatMessage {
  context?: AiContextSnapshot
  streaming?: boolean
  actionsApplied?: boolean[]
  actionErrors?: (string | null)[]
}

export function useChat(deps: UseChatDeps) {
  const depsRef = useRef(deps)
  depsRef.current = deps

  const [messages, setMessages] = useState<ChatMessageState[]>([])
  const [addedFiles, setAddedFiles] = useState<FileEntry[]>([])
  const [streaming, setStreaming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [historyTruncated, setHistoryTruncated] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  // Re-entrancy guards: `streaming` state is one render behind, so in-flight
  // facts live in refs (send overlap + Apply double-click).
  const streamingRef = useRef(false)
  const inFlightActions = useRef<Set<string>>(new Set())
  const { apply: applyProposal } = useAiProposal({
    getContext: () => snapshotContext({ rootPath: depsRef.current.currentPath, entries: depsRef.current.entries, selectedPaths: depsRef.current.selected.map((entry) => entry.path), guardOn: depsRef.current.guardOn, location: depsRef.current.location }),
    contextChangedMessage: i18n.t('ai.contextChanged'),
  })

  const addFile = useCallback(
    (f: FileEntry) => setAddedFiles((prev) => (prev.some((p) => p.path === f.path) ? prev : [...prev, f])),
    [],
  )
  const removeAdded = useCallback((path: string) => setAddedFiles((prev) => prev.filter((p) => p.path !== path)), [])
  const reset = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setAddedFiles([])
    setError('')
    setHistoryTruncated(false)
  }, [])

  useEffect(() => {
    if (deps.enabled === false) abortRef.current?.abort()
  }, [deps.enabled])

  const send = useCallback(
    async (text: string, extraFiles: FileEntry[] = []) => {
      if (depsRef.current.enabled === false || !getAppConfig().ai.enabled) return
      if (!text.trim() || streamingRef.current) return
      streamingRef.current = true
      setError('')
      const userMsg: ChatMessageState = { role: 'user', content: text }
      setMessages((prev) => [...prev, userMsg])
      const asst: ChatMessageState = { role: 'assistant', content: '', streaming: true }
      asst.context = snapshotContext({
        rootPath: depsRef.current.currentPath,
        entries: depsRef.current.entries,
        selectedPaths: depsRef.current.selected.map((entry) => entry.path),
        guardOn: depsRef.current.guardOn,
        location: depsRef.current.location,
      })
      setMessages((prev) => [...prev, asst])
      setStreaming(true)
      setBusy(true)
      const ctrl = new AbortController()
      abortRef.current = ctrl
      const debugId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      addDebugLog({
        id: debugId,
        kind: 'chat',
        model: depsRef.current.model,
        status: 'pending',
        stage: 'stream',
        promptText: text,
        signature: `chat:${depsRef.current.currentPath}`,
      })
      addDebugEvent(debugId, { stage: 'stream', type: 'start' })
      try {
        const d = depsRef.current
        const attached = [...d.selected, ...addedFiles, ...extraFiles]
        // Vision gate (spec §5.2): images are dropped from context when the
        // model cannot ingest them, with the same note UX as Summarize.
        const caps = modelCapabilities(d.model)
        const gate = visionGate(attached, caps)
        if (gate.note) d.setStatus(gate.note, 'info')
        const usable = caps.supportsVision ? attached : attached.filter((f) => !isImageName(f.name, f.extension))
        const ctx = usable.length ? renderBudgeted(budgetFiles(await collectFileContents(usable))) : ''
        const dirListing = renderDirListing(d.entries)
        const { system, prompt, truncated } = buildChatPrompt({ currentDir: d.currentPath, dirListing, fileContext: ctx }, messages, text)
        const stream = d.streamChat ?? streamChat
        let raw = ''
        let finish: AiFinishMeta | undefined
        for await (const chunk of stream({ model: d.model, system, prompt, signal: ctrl.signal, onFinish: (meta) => { finish = meta } })) {
          raw += chunk
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (!last?.streaming) return prev
            next[next.length - 1] = { ...last, content: raw }
            return next
          })
        }
        const { text: clean, actions } = extractActions(raw)
        updateDebugLog(debugId, { status: 'success', stage: 'stream' })
        addDebugEvent(debugId, { stage: 'stream', type: 'success', metadata: { textChars: raw.length, finishReason: finish?.finishReason ?? null } })
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (!last?.streaming) return prev
          const patched = { ...last }
          patched.content = clean
          patched.actions = actions
          patched.streaming = false
          if (actions.length) {
            patched.actionsApplied = actions.map(() => false)
            patched.actionErrors = actions.map(() => null)
          }
          next[next.length - 1] = patched
          return next
        })
        if (finish?.finishReason === 'length') setError(i18n.t('chat.responseTruncated'))
        if (truncated) setHistoryTruncated(true)
      } catch (e) {
        updateDebugLog(debugId, { status: 'error', errorDetails: String(e) })
        addDebugEvent(debugId, { stage: 'stream', type: 'error', detail: String(e) })
        if (!ctrl.signal.aborted) setError(String(e))
        setMessages((prev) => {
          const next = [...prev]
          if (next[next.length - 1]?.streaming) {
            next[next.length - 1] = { ...next[next.length - 1], streaming: false }
          }
          return next
        })
      } finally {
        streamingRef.current = false
        setStreaming(false)
        setBusy(false)
        abortRef.current = null
      }
    },
    [addedFiles, messages],
  )

  const applyAction = useCallback(
    async (msgIdx: number, actIdx: number) => {
      if (depsRef.current.enabled === false || !getAppConfig().ai.enabled) return
      const key = `${msgIdx}:${actIdx}`
      if (inFlightActions.current.has(key)) return
      const d = depsRef.current
      const msg = messages[msgIdx]
      const action = msg?.actions?.[actIdx]
      if (!action) return
      inFlightActions.current.add(key)
      const patch = (fn: (s: ChatMessageState) => ChatMessageState) =>
        setMessages((prev) => prev.map((m, i) => (i === msgIdx ? fn(m) : m)))
      const setErrorAt = (text: string) =>
        patch((m) => {
          const errs = [...(m.actionErrors ?? [])]
          errs[actIdx] = text
          return { ...m, actionErrors: errs }
        })
      try {
        const v = validateChatAction(action, {
          currentDir: d.currentPath,
          existingNames: d.entries.map((e) => e.name),
          guardOn: d.guardOn,
          entries: d.entries,
        })
        if (!v.ok) {
          setErrorAt(v.error)
          d.setStatus(v.error, 'error')
          return
        }
        const a = v.action
        const converted = proposalFromChatActions([a], {
          snapshot: msg.context,
          currentDir: d.currentPath,
          entries: d.entries,
          selectedPaths: d.selected.map((entry) => entry.path),
          guardOn: d.guardOn,
          location: d.location,
        })
        const conversionError = converted.invalidActions[0]
        if (conversionError) {
          setErrorAt(conversionError.error)
          d.setStatus(conversionError.error, 'error')
          return
        }
        const applied = await applyProposal(converted.proposal)
        if (!applied.applied && !applied.failures.length) return
        if (applied.failures.length) {
          const msg2 = applied.failures.map((f) => f.error).join('; ')
          setErrorAt(msg2)
          d.setStatus(msg2, 'error')
          return
        }
        patch((m) => {
          const applied = [...(m.actionsApplied ?? [])]
          applied[actIdx] = true
          return { ...m, actionsApplied: applied }
        })
        d.setStatus(i18n.t('chat.appliedShort'), 'success')
        d.refresh()
      } catch (e) {
        const msg2 = String(e)
        setErrorAt(msg2)
        d.setStatus(msg2, 'error')
      } finally {
        inFlightActions.current.delete(key)
      }
    },
    [messages, applyProposal],
  )

  const cancelAction = useCallback((msgIdx: number, actIdx: number) => {
    setMessages((prev) =>
      prev.map((m, i) => {
        if (i !== msgIdx) return m
        const cancelled = [...(m.actionsApplied ?? [])]
        cancelled[actIdx] = true // reuse flag as "no more interactive"
        const errs = [...(m.actionErrors ?? [])]
        errs[actIdx] = CANCELLED_SENTINEL
        return { ...m, actionsApplied: cancelled, actionErrors: errs }
      }),
    )
  }, [])

  const validateAction = useCallback(
    (msgIdx: number, actIdx: number): { ok: true; requiresPlan?: boolean } | { ok: false; error: string } => {
      const a = messages[msgIdx]?.actions?.[actIdx]
      if (!a) return { ok: false, error: 'unknown action' }
      const result = proposalFromChatActions([a], {
        currentDir: depsRef.current.currentPath,
        entries: depsRef.current.entries,
        guardOn: depsRef.current.guardOn,
        location: depsRef.current.location,
      })
      const invalid = result.invalidActions[0]
      return invalid
        ? { ok: false, error: invalid.error }
        : { ok: true, requiresPlan: result.proposal.review === 'plan' && depsRef.current.location?.kind === 'network' }
    },
    [messages],
  )

  return {
    messages,
    streaming,
    busy,
    error,
    historyTruncated,
    addedFiles,
    send,
    abort: () => abortRef.current?.abort(),
    applyAction,
    cancelAction,
    validateAction,
    reset,
    addFile,
    removeAdded,
  }
}

export type ChatController = ReturnType<typeof useChat>
