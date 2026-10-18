// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAIModel, listModels } from '@gi4nks/wise'
import { generateObject, streamText } from 'ai'
import { gatewayBase } from '../api'

vi.mock('@gi4nks/wise', () => ({ createAIModel: vi.fn(), listModels: vi.fn() }))
vi.mock('ai', () => ({ generateObject: vi.fn(), streamText: vi.fn() }))
vi.mock('../api', () => ({ gatewayBase: vi.fn() }))

describe('AI runtime gateway adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(gatewayBase).mockResolvedValue('http://127.0.0.1:4321/v1')
    vi.mocked(createAIModel).mockResolvedValue({ modelId: 'model' } as never)
  })

  it('memoizes the gateway base and parses gateway health and model ids', async () => {
    const runtime = await import('./runtime')
    expect(await runtime.resolveGatewayBase()).toBe('http://127.0.0.1:4321/v1')
    expect(await runtime.resolveGatewayBase()).toBe('http://127.0.0.1:4321/v1')
    expect(gatewayBase).toHaveBeenCalledOnce()
    expect(runtime.gatewayRoot('http://host/v1/')).toBe('http://host')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, providers: { local: true } }),
    }))
    expect(await runtime.checkHealth(undefined, 'provider/name with spaces')).toEqual({ ok: true, providers: { local: true } })
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4321/healthz?provider=provider&model=name%20with%20spaces',
      { signal: undefined },
    )

    vi.mocked(listModels).mockResolvedValue([
      { id: 'local/one', name: 'One' },
      { id: 'standalone', name: 'Standalone' },
    ] as never)
    expect(await runtime.listAvailableModels()).toEqual([
      { id: 'one', name: 'One', provider: 'local' },
      { id: 'standalone', name: 'Standalone', provider: '' },
    ])
    expect(listModels).toHaveBeenCalledWith('opencode', { opencode: { apiKey: 'local-gateway', baseUrl: 'http://127.0.0.1:4321/v1' } }, { signal: undefined })
    await runtime.getModel('local/one')
    expect(createAIModel).toHaveBeenCalledWith('opencode', 'local/one', { opencode: { apiKey: 'local-gateway', baseUrl: 'http://127.0.0.1:4321/v1' } })
    vi.unstubAllGlobals()
  })

  it('turns failed health probes into an unavailable result', async () => {
    const runtime = await import('./runtime')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await runtime.checkHealth()).toEqual({ ok: false, providers: {} })
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response)
    expect(await runtime.checkHealth()).toEqual({ ok: false, providers: {} })
    vi.unstubAllGlobals()
  })

  it('returns structured results and reports response headers', async () => {
    const runtime = await import('./runtime')
    const onResponse = vi.fn()
    vi.mocked(generateObject).mockResolvedValue({ object: { ok: true }, response: { headers: { 'x-test': 'yes' } } } as never)
    expect(await runtime.generateStructured({ model: 'local/one', schema: {} as never, prompt: 'classify', onResponse })).toEqual({ ok: true })
    expect(onResponse).toHaveBeenCalledWith({ headers: { 'x-test': 'yes' } })
    expect(generateObject).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'classify', abortSignal: expect.any(AbortSignal) }))

    const model = await runtime.getModel('local/one')
    vi.mocked(streamText).mockResolvedValue({ textStream: ['hello'] } as never)
    expect(await runtime.streamAssistant({ model: 'local/one', prompt: 'say hello' })).toEqual({ textStream: ['hello'] })
    expect(streamText).toHaveBeenCalledWith(expect.objectContaining({ model, prompt: 'say hello' }))
  })

  it('streams chat chunks with finish and upstream response metadata', async () => {
    const runtime = await import('./runtime')
    const onFinish = vi.fn()
    const onResponse = vi.fn()
    vi.mocked(streamText).mockResolvedValue({
      textStream: (async function* () { yield 'hello'; yield ' world' })(),
      finishReason: Promise.resolve('stop'),
      response: Promise.resolve({ headers: { 'x-clive-upstream-status': '206', 'x-provider': 'local' } }),
    } as never)
    const chunks: string[] = []
    for await (const chunk of runtime.streamChat({ model: 'local/one', prompt: 'chat', maxOutputTokens: 20, onFinish, onResponse })) chunks.push(chunk)
    expect(chunks).toEqual(['hello', ' world'])
    expect(onFinish).toHaveBeenCalledWith({ finishReason: 'stop', textChars: 11 })
    expect(onResponse).toHaveBeenCalledWith({ status: 206, headers: { 'x-clive-upstream-status': '206', 'x-provider': 'local' } })
  })

  it('propagates provider errors and normalizes cancellation from structured calls', async () => {
    const runtime = await import('./runtime')
    vi.mocked(generateObject).mockRejectedValueOnce(new Error('provider failed'))
    await expect(runtime.generateStructured({ model: 'm', schema: {} as never, prompt: 'p' })).rejects.toThrow('provider failed')

    const controller = new AbortController()
    controller.abort()
    vi.mocked(generateObject).mockRejectedValueOnce(new Error('aborted by caller'))
    await expect(runtime.generateStructured({ model: 'm', schema: {} as never, prompt: 'p', signal: controller.signal })).rejects.toMatchObject({ code: 'aborted' })
  })
})
