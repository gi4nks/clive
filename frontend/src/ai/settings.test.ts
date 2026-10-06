import { describe, it, expect, beforeEach } from 'vitest'
import { setProviders, isCloudProvider, providerLabel, visibleProviders } from './settings'
import { setAppConfig } from '../settings/appConfig'

const P = (id: string, cloud: boolean, builtin = false) => ({
  id, baseUrl: `https://${id}.test/v1`, device: `/dev/disk9s${id.length}`, hasKey: false, keyPreview: null, cloud, builtin,
})

describe('provider registry (gateway-driven)', () => {
  beforeEach(() => {
    setProviders([P('ollama', false, true), P('opencode-go', true, true), P('openrouter', true)])
    setAppConfig({ ai: { cloudOptIn: true } })
  })

  it('reads cloud flags from the registry', () => {
    expect(isCloudProvider('ollama')).toBe(false)
    expect(isCloudProvider('openrouter')).toBe(true)
    // unknown ids default to cloud (privacy-safe)
    expect(isCloudProvider('ghost')).toBe(true)
  })

  it('labels built-ins and falls back to the raw id for customs', () => {
    expect(providerLabel('ollama')).toBe('Ollama (local)')
    expect(providerLabel('openrouter')).toBe('openrouter')
  })

  it('visibleProviders respects the cloud opt-in', () => {
    expect(visibleProviders().map((p) => p.id)).toEqual(['ollama', 'opencode-go', 'openrouter'])
    setAppConfig({ ai: { cloudOptIn: false } })
    expect(visibleProviders().map((p) => p.id)).toEqual(['ollama'])
  })
})
