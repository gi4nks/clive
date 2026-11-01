/**
 * AI runtime for the webview (tasks 1.7–1.9, 1.12).
 *
 * `@gi4nks/wise` returns a Vercel AI SDK v7 model, which performs `fetch`. In
 * clive (Tauri, no Node server) every model call is routed through the loopback
 * Rust AI Gateway, so the frontend always speaks one OpenAI-compatible endpoint
 * at http://127.0.0.1:<port>/v1. Provider keys and cloud/privacy gating live in
 * the gateway, not here.
 */
import { createAIModel } from '@gi4nks/wise'
import type { LanguageModel, ModelMessage } from 'ai'
import { generateObject, streamText } from 'ai'
import type { ZodType } from 'zod'
import { gatewayBase } from '../api'
import { getAppConfig } from '../settings/appConfig'
import { linkedAbortController } from './execution.js'

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
  selected?: { provider: string; model: string; providerOk: boolean; modelAvailable: boolean }
}

/** Probe the gateway health endpoint. Returns ok=false when unreachable. */
export async function checkHealth(signal?: AbortSignal, model?: string): Promise<AiHealth> {
  try {
    const base = await resolveGatewayBase()
    const query = model?.includes('/') ? `?provider=${encodeURIComponent(model.split('/')[0])}&model=${encodeURIComponent(model.slice(model.indexOf('/') + 1))}` : ''
    const res = await fetch(`${gatewayRoot(base)}/healthz${query}`, { signal })
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
  state?: string
  loaded?: boolean
  contextLength?: number
  capabilities?: string[]
  inputModalities?: string[]
}

/** List models from the gateway without Wise's five-minute model-list cache. */
export async function listAvailableModels(signal?: AbortSignal): Promise<ModelOption[]> {
  const base = await resolveGatewayBase()
  const response = await fetch(`${base}/models`, { signal })
  if (!response.ok) throw new Error(`Model discovery failed (${response.status})`)
  const payload = (await response.json()) as { data?: unknown }
  if (!Array.isArray(payload.data)) throw new Error('Model discovery returned an invalid response')

  return payload.data.flatMap((value): ModelOption[] => {
    if (!value || typeof value !== 'object') return []
    const model = value as Record<string, unknown>
    if (typeof model.id !== 'string') return []
    const prefix = typeof model.owned_by === 'string' ? model.owned_by : ''
    const slash = model.id.indexOf('/')
    const provider = prefix || (slash > 0 ? model.id.slice(0, slash) : '')
    const id = provider && model.id.startsWith(`${provider}/`)
      ? model.id.slice(provider.length + 1)
      : slash > 0 ? model.id.slice(slash + 1) : model.id
    const rawContext = typeof model.context_length === 'number'
      ? model.context_length
      : typeof model.max_model_len === 'number'
        ? model.max_model_len
        : undefined
    return [{
      id,
      name: typeof model.name === 'string' ? model.name : id,
      provider,
      ...(typeof model.state === 'string' ? { state: model.state } : {}),
      ...(typeof model.loaded === 'boolean' ? { loaded: model.loaded } : {}),
      ...(rawContext && rawContext > 0 ? { contextLength: rawContext } : {}),
      ...(Array.isArray(model.capabilities) && model.capabilities.every((item) => typeof item === 'string')
        ? { capabilities: model.capabilities as string[] }
        : {}),
      ...(Array.isArray(model.input_modalities) && model.input_modalities.every((item) => typeof item === 'string')
        ? { inputModalities: model.input_modalities as string[] }
        : {}),
    }]
  })
}

function gatewayPolicyHeaders(): Record<string, string> {
  return {
    'x-clive-cloud-allowed': getAppConfig().ai.cloudOptIn ? 'true' : 'false',
  }
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
  timeoutMs?: number
  onResponse?: (meta: AiResponseMeta) => void
}

export interface AiResponseMeta {
  status?: number
  headers?: Record<string, string>
}

export interface AiFinishMeta {
  finishReason?: string
  textChars?: number
}

/** A schema-validated structured generation call. */
export async function generateStructured<S extends ZodType>(
  args: StructuredArgs<S>,
): Promise<unknown> {
  const run = linkedAbortController(args.signal, args.timeoutMs)
  try {
    const model = await getModel(args.model)
    const result = await generateObject({
      model,
      schema: args.schema,
      system: args.system,
      prompt: args.prompt,
      headers: gatewayPolicyHeaders(),
      abortSignal: run.signal,
    })
    args.onResponse?.({ headers: result.response.headers })
    return result.object
  } catch (e) {
    if (run.signal.aborted) throw run.error()
    throw e
  } finally {
    run.finish()
  }
}

export interface StreamArgs {
  model: string
  system?: string
  prompt?: string
  messages?: ModelMessage[]
  signal?: AbortSignal
  timeoutMs?: number
  maxOutputTokens?: number
  onResponse?: (meta: AiResponseMeta) => void
  onFinish?: (meta: AiFinishMeta) => void
}

/** Begin a streamed text generation (used by summarize/chat surfaces). */
export async function streamAssistant(args: StreamArgs) {
  const model = await getModel(args.model)
  const promptInput = args.messages?.length
    ? { messages: args.messages }
    : { prompt: args.prompt ?? '' }
  return streamText({
    model,
    system: args.system,
    ...promptInput,
    headers: gatewayPolicyHeaders(),
    abortSignal: args.signal,
  })
}

/** Stream a chat turn and yield text chunks; abort via signal. */
export async function* streamChat(args: StreamArgs): AsyncGenerator<string, void, unknown> {
  const run = linkedAbortController(args.signal, args.timeoutMs)
  try {
    const model = await getModel(args.model)
    const promptInput = args.messages?.length
      ? { messages: args.messages }
      : { prompt: args.prompt ?? '' }
    const result = await streamText({
      model,
      system: args.system,
      ...promptInput,
      headers: gatewayPolicyHeaders(),
      abortSignal: run.signal,
      maxOutputTokens: args.maxOutputTokens,
    })
    let textChars = 0
    for await (const chunk of result.textStream) {
      textChars += chunk.length
      yield chunk
    }
    args.onFinish?.({ finishReason: await result.finishReason, textChars })
    const response = await result.response
    args.onResponse?.({
      status: response.headers?.['x-clive-upstream-status'] ? Number(response.headers['x-clive-upstream-status']) : undefined,
      headers: response.headers,
    })
  } catch (e) {
    if (run.signal.aborted) throw run.error()
    throw e
  } finally {
    run.finish()
  }
}
