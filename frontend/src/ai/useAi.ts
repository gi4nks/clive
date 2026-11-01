/**
 * Shared AI orchestration (single source of truth for the widget and the
 * right-click context menu). Holds selection/health/models + the imperative
 * run/apply/undo flow for the four actions and the preview state that the
 * overlay renders. Kept as a hook so App can call it once and pass the handle
 * both to the status-bar widget (via ctx) and to `actionsFor`.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileEntry } from '../api'
import i18n from '../i18n'
import { getAppConfig, useAppConfig } from '../settings/appConfig'
import { checkHealth, listAvailableModels, type AiHealth, type ModelOption } from './runtime'
import { fullModelId, getProviders, isCloudProvider, refreshProviders, useProviderRegistry } from './settings'
import {
  generateContent,
  organizeToApply,
  proposeOrganize,
  proposeRenames,
  summarize,
  type OrganizePlan,
} from './actions'
import { collectFileContents } from './fs'
import { isImageName, modelCapabilities, visionGate } from './capabilities'
import { validateNewName } from './safety'
import { createProposal } from './proposal.js'
import { useAiProposal } from './useAiProposal.js'
import { snapshotContext } from './context.js'
import { describeAiError } from './execution.js'
import { addDebugEvent, addDebugLog, updateDebugLog } from './usePlanDebug.js'
import type { LocationDescriptor } from '../location.js'

function pickPreferredModel(models: ModelOption[], providerId: string): ModelOption | undefined {
  const list = models.filter((m) => m.provider === providerId)
  return list.find((m) => m.state === 'ready' || m.loaded === true) ?? list[0]
}

export type AiKind = 'rename' | 'summarize' | 'organize' | 'generate' | 'apply'
export interface RenameRow {
  path: string
  from: string
  to: string
  ok: boolean
  error?: string
}

export interface AiDeps {
  currentPath: string
  entries: FileEntry[]
  selectedPaths: string[]
  guardOn: boolean
  location?: LocationDescriptor
  setStatus: (msg: string, kind: 'success' | 'error' | 'info') => void
  refresh: () => void
}

export function useAi(deps: AiDeps) {
  const depsRef = useRef(deps)
  useEffect(() => {
    depsRef.current = deps
  })

  const [cfg, setCfg] = useAppConfig()
  const sel = { provider: cfg.ai.provider, model: cfg.ai.model }
  const [models, setModels] = useState<ModelOption[]>([])
  const modelsRef = useRef<ModelOption[]>([])
  const refreshModels = useCallback(async () => {
    const available = await listAvailableModels()
    if (available.length) {
      modelsRef.current = available
      setModels(available)
    }
    return available
  }, [])
  const [health, setHealth] = useState<AiHealth | null>(null)
  const providers = useProviderRegistry()
  const [busy, setBusy] = useState<AiKind | null>(null)
  const [summary, setSummary] = useState('')
  const [rows, setRows] = useState<RenameRow[] | null>(null)
  const [organize, setOrganize] = useState<OrganizePlan | null>(null)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [gen, setGen] = useState<{ name: string; body: string } | null>(null)
  const [journal, setJournal] = useState<string | null>(null)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    if (!cfg.ai.enabled) abortRef.current?.abort()
  }, [cfg.ai.enabled])
  useEffect(() => {
    if (!cfg.ai.enabled) return
    if (!getProviders().length) void refreshProviders().catch(() => undefined)
    void refreshModels().catch(() => undefined)
  }, [cfg.ai.enabled, refreshModels])
  const proposalContextRef = useRef<ReturnType<typeof snapshotContext> | null>(null)
  const currentContext = () => snapshotContext({
    rootPath: depsRef.current.currentPath,
    entries: depsRef.current.entries,
    selectedPaths: depsRef.current.selectedPaths,
    guardOn: depsRef.current.guardOn,
    location: depsRef.current.location,
  })
  const proposal = useAiProposal({
    getContext: currentContext,
    contextChangedMessage: i18n.t('ai.contextChanged'),
  })

  const full = fullModelId(sel)

  const setProvider = (provider: string) => {
    const first = pickPreferredModel(models, provider)
    setCfg({ ai: { provider, model: first?.id ?? sel.model } })
  }
  const setModel = (model: string) => {
    setCfg({ ai: { provider: sel.provider, model } })
  }

  const cloudAllowed = !isCloudProvider(sel.provider) || cfg.ai.cloudOptIn
  const assertUsable = () => {
    if (!cloudAllowed) throw new Error(i18n.t('ai.cloudDisabled'))
  }

  const refresh = async () => {
    void refreshProviders().catch(() => undefined)
    const h = await checkHealth()
    setHealth(h)
    if (h.ok) {
      try {
          await refreshModels()
      } catch {
        /* keep previous */
      }
    }
  }

  // Load health/model lazily so actions triggered outside the popover (e.g. the
  // context menu) work even if the panel was never opened this session.
  const ensureHealth = async (): Promise<AiHealth> => {
    void refreshProviders().catch(() => undefined)
    if (health) return health
    const h = await checkHealth()
    setHealth(h)
    if (h.ok) {
      try {
        if (!modelsRef.current.length) {
          await refreshModels()
        }
      } catch {
        /* keep previous */
      }
    }
    return h
  }

  // Auto-selection: empty/stored-off/cloud-blocked provider falls back to the
  // first usable one (online preferred, registry order otherwise) + first ready model.
  useEffect(() => {
    if (!providers.length) return
    const cloudOk = (id: string) => !isCloudProvider(id) || cfg.ai.cloudOptIn
    const current = providers.find((p) => p.id === cfg.ai.provider)
    const currentUsable = !!current && cloudOk(current.id) && (!health || !!health.providers[current.id])
    if (currentUsable) {
      if (!cfg.ai.model) {
        const first = pickPreferredModel(models, current!.id)
        if (first) setCfg({ ai: { provider: current!.id, model: first.id } })
      }
      return
    }
    const allowed = providers.filter((p) => cloudOk(p.id))
    const next = (health ? allowed.find((p) => health.providers[p.id]) : undefined) ?? allowed[0]
    if (!next) return
    const first = pickPreferredModel(models, next.id)
    if (cfg.ai.provider === next.id && cfg.ai.model === (first?.id ?? cfg.ai.model)) return
    setCfg({ ai: { provider: next.id, model: first?.id ?? '' } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers, health, models, cfg.ai.provider, cfg.ai.model, cfg.ai.cloudOptIn])

  const run = async (mode: AiKind, fn: (signal: AbortSignal, debugId?: string) => Promise<void>) => {
    if (!getAppConfig().ai.enabled) return
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setBusy(mode)
    setError('')
    const isModelAction = mode !== 'apply'
    const debugId = isModelAction ? `action-${mode}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` : undefined
    if (debugId) {
      addDebugLog({
        id: debugId,
        kind: 'action',
        model: full,
        status: 'pending',
        stage: 'stream',
        promptText: mode,
        signature: `${mode}:${depsRef.current.currentPath}`,
      })
      addDebugEvent(debugId, { stage: 'stream', type: 'start', detail: mode })
    }
    try {
      await fn(ctrl.signal, debugId)
      if (debugId) {
        updateDebugLog(debugId, { status: 'success', stage: 'stream' })
        addDebugEvent(debugId, { stage: 'stream', type: 'success' })
      }
    } catch (e) {
      const msg = describeAiError(e)
      if (debugId) {
        updateDebugLog(debugId, { status: 'error', errorDetails: msg })
        addDebugEvent(debugId, { stage: 'stream', type: 'error', detail: msg })
      }
      if (!ctrl.signal.aborted) {
        setError(msg)
        depsRef.current.setStatus(msg, 'error')
      }
    } finally {
      setBusy(null)
      abortRef.current = null
    }
  }

  const requestRename = (selected: FileEntry[]) =>
    run('rename', async (signal) => {
      if (!selected.length) return
      assertUsable()
      const h = await ensureHealth()
      if (!h.ok) throw new Error(i18n.t('ai.providerUnreachable'))
      setRows(null)
      setOrganize(null)
      setSummary('')
      const d = depsRef.current
      proposalContextRef.current = currentContext()
      const files = await collectFileContents(selected)
      const proposals = await proposeRenames(files, d.entries.map((e) => e.name), { model: full, health: h, signal })
      setRows(
        proposals.map((p) => ({
          path: p.path,
          from: p.resolved.from,
          to: p.resolved.to,
          ok: p.resolved.ok,
          error: p.resolved.error,
        })),
      )
    })

  const requestSummarize = (selected: FileEntry[]) =>
    run('summarize', async (signal) => {
      if (!selected.length) return
      assertUsable()
      const h = await ensureHealth()
      if (!h.ok) throw new Error(i18n.t('ai.providerUnreachable'))
      const selectedModel = modelsRef.current.find((m) => m.provider === sel.provider && m.id === sel.model)
      const caps = modelCapabilities(full, selectedModel)
      const gate = visionGate(selected, caps)
      if (gate.blocked) {
        depsRef.current.setStatus(gate.note ?? i18n.t('ai.noVision'), 'error')
        return
      }
      if (gate.note) depsRef.current.setStatus(gate.note, 'info')
      setSummary('')
      setRows(null)
      setOrganize(null)
      const usable = caps.supportsVision ? selected : selected.filter((f) => !isImageName(f.name, f.extension))
      const includeImages = caps.supportsVision && usable.some((f) => isImageName(f.name, f.extension))
      const files = includeImages
        ? await collectFileContents(usable, { includeImages: true })
        : await collectFileContents(usable)
      const text = await summarize(files, { model: full, health: h, signal })
      setSummary(text)
      if (!text.trim()) throw new Error(i18n.t('ai.emptyResult'))
    })

  const requestOrganize = (selected: FileEntry[]) =>
    run('organize', async (signal) => {
      if (!selected.length) return
      assertUsable()
      const h = await ensureHealth()
      if (!h.ok) throw new Error(i18n.t('ai.providerUnreachable'))
      setOrganize(null)
      setRows(null)
      setSummary('')
      setExcluded(new Set())
      proposalContextRef.current = currentContext()
      const files = await collectFileContents(selected)
      setOrganize(await proposeOrganize(files, { model: full, health: h, signal }))
    })

  const runMultiRename = (renames: { path: string; newName: string }[]) =>
    run('apply', async () => {
      if (!renames.length) return
      proposalContextRef.current = currentContext()
      const res = await proposal.apply(createProposal({
        origin: 'quick-action',
        rootPath: depsRef.current.currentPath,
        operations: renames.map((rename, index) => ({ ...rename, id: `rename:${index}`, kind: 'rename' as const })),
        location: depsRef.current.location,
        context: proposalContextRef.current ?? currentContext(),
      }))
      if (res.applied) {
        setJournal(res.batchId)
        depsRef.current.setStatus(i18n.t('rename.applied', { count: res.applied }), 'success')
        depsRef.current.refresh()
      }
      if (res.failures.length) depsRef.current.setStatus(i18n.t('ai.errors', { count: res.failures.length }), 'error')
      proposalContextRef.current = null
    })

  const requestGenerate = (prompt: string) =>
    run('generate', async (signal) => {
      if (!prompt.trim()) return
      assertUsable()
      const h = await ensureHealth()
      if (!h.ok) throw new Error(i18n.t('ai.providerUnreachable'))
      proposalContextRef.current = currentContext()
      setGen(null)
      setGen(await generateContent(prompt, { model: full, health: h, signal }))
    })

  const apply = () =>
    run('apply', async () => {
      const d = depsRef.current
      if (gen) {
        const chk = validateNewName(gen.name)
        if (!chk.ok || !chk.name) {
          d.setStatus(i18n.t('ai.invalidName'), 'error')
          return
        }
        const res = await proposal.apply(createProposal({
          origin: 'quick-action',
          rootPath: d.currentPath,
          operations: [{ id: 'create-file:0', kind: 'createFile', path: `${d.currentPath}/${chk.name}`, content: gen.body }],
          location: d.location,
          context: proposalContextRef.current ?? currentContext(),
        }))
        if (res.failures.length) {
          d.setStatus(res.failures.map((failure) => failure.error).join('; '), 'error')
          return
        }
        if (!res.applied) return
        setGen(null)
        setJournal(res.batchId)
        proposalContextRef.current = null
        d.setStatus(i18n.t('ai.fileCreated'), 'success')
        d.refresh()
        return
      }
      if (rows) {
        const renames = rows
          .filter((r) => r.ok && validateNewName(r.to).ok && validateNewName(r.to).name !== r.from)
          .map((r) => ({ path: r.path, newName: r.to }))
        if (!renames.length) return
        const res = await proposal.apply(createProposal({
          origin: 'quick-action',
          rootPath: d.currentPath,
          operations: renames.map((rename, index) => ({ ...rename, id: `rename:${index}`, kind: 'rename' as const })),
          location: d.location,
          context: proposalContextRef.current ?? currentContext(),
        }))
        if (res.applied) {
          setRows(null)
          setJournal(res.batchId)
          d.setStatus(i18n.t('ai.renamed', { count: res.applied }), 'success')
          d.refresh()
        }
        if (res.failures.length) d.setStatus(i18n.t('ai.errors', { count: res.failures.length }), 'error')
        proposalContextRef.current = null
        return
      }
      if (organize) {
        const kept: OrganizePlan = { ...organize, moves: organize.moves.filter((m) => !excluded.has(m.src)) }
        const { folders, moves } = organizeToApply(kept, d.currentPath)
        if (!folders.length && !moves.length) return
        const res = await proposal.apply(createProposal({
          origin: 'quick-action',
          rootPath: d.currentPath,
          operations: [
            ...folders.map((path, index) => ({ id: `folder:${index}`, kind: 'createFolder' as const, path })),
            ...moves.map((move, index) => ({
              id: `move:${index}`,
              kind: 'move' as const,
              path: move.src,
              destDir: move.dst.slice(0, move.dst.lastIndexOf('/')) || d.currentPath,
              destName: move.dst.slice(move.dst.lastIndexOf('/') + 1),
            })),
          ],
          location: d.location,
          context: proposalContextRef.current ?? currentContext(),
        }))
        if (res.applied) {
          setOrganize(null)
          setJournal(res.batchId)
          d.setStatus(i18n.t('ai.organized', { count: moves.length }), 'success')
          d.refresh()
        }
        if (res.failures.length) d.setStatus(i18n.t('ai.errors', { count: res.failures.length }), 'error')
        proposalContextRef.current = null
      }
    })

  const cancel = () => {
    setRows(null)
    setOrganize(null)
    setGen(null)
    setSummary('')
    setError('')
    proposalContextRef.current = null
  }

  const undo = async () => {
    if (!journal) return
    const res = await proposal.undo()
    if (!res) return
    if (res.failures.length) {
      depsRef.current.setStatus(i18n.t('ai.errors', { count: res.failures.length }), 'error')
    } else {
      setJournal(null)
      const applied = res.applied
      depsRef.current.setStatus(applied ? i18n.t('ai.restored') : i18n.t('ai.nothingToRestore'), applied ? 'success' : 'info')
    }
    depsRef.current.refresh()
  }

  const toggleExcluded = (src: string) =>
    setExcluded((prev) => {
      const n = new Set(prev)
      if (n.has(src)) n.delete(src)
      else n.add(src)
      return n
    })

  const gatewayDown = !!health && !health.ok
  const providerOk = !!health?.providers[sel.provider]
  const offline = !health || gatewayDown || !providerOk
  const hasPreview = !!(rows || organize || summary || gen)

  return {
    // selection & health
    sel,
    setProvider,
    setModel,
    models,
    providerModels: models.filter((m) => m.provider === sel.provider),
    health,
    gatewayDown,
    providerOk,
    offline,
    cloudOptIn: cfg.ai.cloudOptIn,
    cloudAllowed,
    refresh,
    refreshModels,
    ensureReady: ensureHealth,
    // execution
    busy,
    error,
    hasPreview,
    requestRename,
    requestSummarize,
    requestOrganize,
    requestGenerate,
    runMultiRename,
    apply,
    cancel,
    undo,
    abort: () => abortRef.current?.abort(),
    // preview state (for the overlay)
    summary,
    rows,
    setRows,
    organize,
    excluded,
    toggleExcluded,
    setOrganize,
    gen,
    setGen,
    journal,
  }
}

export type AiController = ReturnType<typeof useAi>
