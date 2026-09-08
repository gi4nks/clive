/**
 * AI selection accessors. These are now thin views over the central
 * `appConfig` (see settings/appConfig) so the same provider/model/cloud choice
 * is shared with the Settings modal (settings-page). Kept as a module so the AI
 * runtime and `useAi` don't import the store directly.
 */
import { DEFAULT_CONFIG, getAppConfig, setAppConfig } from '../settings/appConfig'

export interface AiSelection {
  provider: string
  model: string // bare model id, no provider prefix
}

export interface ProviderMeta {
  id: string
  label: string
  cloud: boolean
}

/** Providers known to the gateway (must match Rust `providers_from_env` ids). */
export const PROVIDERS: ProviderMeta[] = [
  { id: 'opencode-go', label: 'OpenCode Go', cloud: true },
  { id: 'opencode-zen', label: 'OpenCode Zen', cloud: true },
  { id: 'ollama', label: 'Ollama (lab-server)', cloud: false },
]

export const DEFAULT_PROVIDER = DEFAULT_CONFIG.ai.provider
export const DEFAULT_MODEL = DEFAULT_CONFIG.ai.model

export function isCloudProvider(id: string): boolean {
  return PROVIDERS.find((p) => p.id === id)?.cloud ?? false
}

export function cloudOptIn(): boolean {
  return getAppConfig().ai.cloudOptIn
}

/** Providers selectable given the current cloud opt-in. */
export function visibleProviders(): ProviderMeta[] {
  return cloudOptIn() ? PROVIDERS : PROVIDERS.filter((p) => !p.cloud)
}

export function getSelection(): AiSelection {
  const ai = getAppConfig().ai
  return { provider: ai.provider, model: ai.model }
}

export function saveSelection(s: AiSelection): void {
  setAppConfig({ ai: { provider: s.provider, model: s.model } })
}

/** Full gateway model id, e.g. `opencode-go/kimi-k3`. */
export function fullModelId(s: AiSelection): string {
  return `${s.provider}/${s.model}`
}
