/**
 * AI selection accessors + provider registry.
 *
 * The provider list is NOT defined here anymore: the Rust gateway is the
 * single source of truth (built-ins + user-added OpenAI-compatible providers,
 * `ai_get_config`). This module keeps an async-refreshed snapshot that the
 * sync helpers (`isCloudProvider`, `visibleProviders`, `providerLabel`) read
 * from, and React can subscribe to via `useProviderRegistry`.
 *
 * A cloud provider is any whose base URL is not loopback — the gateway derives
 * and reports the flag. Unknown ids default to cloud (privacy-safe).
 */
import { useSyncExternalStore } from 'react'
import { aiGetConfig } from '../api'
import { getAppConfig, setAppConfig } from '../settings/appConfig'

export interface AiSelection {
  provider: string
  model: string // bare model id, no provider prefix
}

export interface GatewayProvider {
  id: string
  baseUrl: string
  device: string
  hasKey: boolean
  keyPreview: string | null
  cloud: boolean
  builtin: boolean
}

/** Display names for the built-in ids only (cosmetic, not a registry). */
const BUILTIN_LABELS: Record<string, string> = {
  'opencode-go': 'OpenCode Go',
  'opencode-zen': 'OpenCode Zen',
  ollama: 'Ollama (local)',
}

let providers: GatewayProvider[] = []
let providersVersion = 0
const listeners = new Set<() => void>()

function emit() {
  providersVersion++
  for (const l of listeners) l()
}

/** Replace the snapshot (gateway fetch or tests). No-op when deep-equal. */
export function setProviders(next: GatewayProvider[]): void {
  if (JSON.stringify(next) === JSON.stringify(providers)) return
  providers = next
  emit()
}

export function getProviders(): GatewayProvider[] {
  return providers
}

export function subscribeProviders(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

let inflight: Promise<GatewayProvider[]> | null = null
/** Fetch the registry from the gateway (dedup concurrent calls). */
export function refreshProviders(): Promise<GatewayProvider[]> {
  if (!inflight) {
    inflight = aiGetConfig()
      .then((r) => {
        const list = Array.isArray(r) ? r : []
        setProviders(list)
        return list
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

/** React view of the registry (App/Settings call it; refresh via refreshProviders). */
export function useProviderRegistry(): GatewayProvider[] {
  return useSyncExternalStore(
    (l) => subscribeProviders(l),
    () => providers,
    () => providers,
  )
}

export function isCloudProvider(id: string): boolean {
  return providers.find((p) => p.id === id)?.cloud ?? true
}

export function providerLabel(id: string): string {
  return BUILTIN_LABELS[id] ?? id
}

export function cloudOptIn(): boolean {
  return getAppConfig().ai.cloudOptIn
}

/** Providers selectable given the current cloud opt-in. */
export function visibleProviders(): GatewayProvider[] {
  return cloudOptIn() ? providers : providers.filter((p) => !p.cloud)
}

export function getSelection(): AiSelection {
  const ai = getAppConfig().ai
  return { provider: ai.provider, model: ai.model }
}

export function saveSelection(s: AiSelection): void {
  setAppConfig({ ai: { provider: s.provider, model: s.model } })
}

/** Full gateway model id, e.g. `openrouter/deepseek/deepseek-chat`. */
export function fullModelId(s: AiSelection): string {
  return `${s.provider}/${s.model}`
}
