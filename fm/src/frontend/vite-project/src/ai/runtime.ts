/**
 * AI runtime for the webview (tasks 1.7–1.9, 1.12).
 *
 * `@gi4nks/wise` returns a Vercel AI SDK v7 model, which performs `fetch`. In
 * clive (Tauri, no Node server) every model call is routed through the loopback
 * Rust AI Gateway, so the frontend always speaks one OpenAI-compatible endpoint
 * at http://127.0.0.1:<port>/v1. Provider keys and cloud/privacy gating live in
 * the gateway, not here.
 */
import { createAIModel, listModels } from '@gi4nks/wise'
import type { LanguageModel } from 'ai'
import { generateObject, streamText } from 'ai'
import type { ZodType } from 'zod'
import { gatewayBase } from '../api'

let cachedBase: string | null = null

/** Resolve (and memoize) the gateway's OpenAI-compatible base URL. */
export async function resolveGatewayBase(): Promise<string> {
  if (cachedBase) return cachedBase
  cachedBase = await gatewayBase()
  return cachedBase
}

/** Root (without /v1) for health checks. */
export function gatewayRoot(base: string): string {
  return base.replace(/\/v1\/?$/, '')
}

export interface AiHealth {
  ok: boolean
  providers: Record<string, boolean>
}

/** Probe the gateway health endpoint. Returns ok=false when unreachable. */
export async function checkHealth(signal?: AbortSignal): Promise<AiHealth> {
  try {
    const base = await resolveGatewayBase()
    const res = await fetch(`${gatewayRoot(base)}/healthz`, { signal })
    if (!res.ok) return { ok: false, providers: {} }
    const data = (await res.json()) as AiHealth
    return data
  } catch {
    return { ok: false, providers: {} }
  }
}

export interface ModelOption {
  /** bare model id (no provider prefix) */
  id: string
  name: string
  /** provider the gateway prefixed it with */
  provider: string
}

/** List models exposed by the gateway (OpenAI-compatible aggregation). */
export async function listAvailableModels(signal?: AbortSignal): Promise<ModelOption[]> {
  const base = await resolveGatewayBase()
  const models = await listModels('opencode', { opencode: { apiKey: 'local-gateway', baseUrl: base } }, { signal })
  return models.map((m) => {
    const slash = m.id.indexOf('/')
    const provider = slash > 0 ? m.id.slice(0, slash) : ''
    const id = slash > 0 ? m.id.slice(slash + 1) : m.id
    return { id, name: m.name, provider }
  })
}

/**
 * Build a model via wise pointed at the gateway. The placeholder key is fine:
 * the gateway injects the real credential (V1: local Ollama needs none).
 */
export async function getModel(modelId: string): Promise<LanguageModel> {
  const base = await resolveGatewayBase()
  return createAIModel('opencode', modelId, {
    opencode: { apiKey: 'local-gateway', baseUrl: base },
  })
}

export interface StructuredArgs<S extends ZodType> {
  model: string
  schema: S
  system?: string
  prompt: string
  signal?: AbortSignal
}

/** A schema-validated structured generation call. */
export async function generateStructured<S extends ZodType>(
  args: StructuredArgs<S>,
): Promise<unknown> {
  const model = await getModel(args.model)
  const { object } = await generateObject({
    model,
    schema: args.schema,
    system: args.system,
    prompt: args.prompt,
    abortSignal: args.signal,
  })
  return object
}

export interface StreamArgs {
  model: string
  system?: string
  prompt: string
  signal?: AbortSignal
}

/** Begin a streamed text generation (used by summarize/chat surfaces). */
export async function streamAssistant(args: StreamArgs) {
  const model = await getModel(args.model)
  return streamText({
    model,
    system: args.system,
    prompt: args.prompt,
    abortSignal: args.signal,
  })
}

/** Stream a chat turn and yield text chunks; abort via signal. */
export async function* streamChat(args: StreamArgs): AsyncGenerator<string, void, unknown> {
  const model = await getModel(args.model)
  const result = await streamText({
    model,
    system: args.system,
    prompt: args.prompt,
    abortSignal: args.signal,
  })
  for await (const chunk of result.textStream) {
    yield chunk
  }
}
