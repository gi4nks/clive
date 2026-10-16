import { describe, it, expect, beforeEach, vi } from 'vitest'

// No native store in tests → exercises the localStorage fallback path.
vi.mock('@tauri-apps/plugin-store', () => ({
  load: () => Promise.reject(new Error('no tauri store in test')),
}))

import {
  DEFAULT_CONFIG,
  getAppConfig,
  setAppConfig,
  normalizeConfig,
  importConfig,
  exportConfig,
  resetConfig,
  initAppConfig,
} from '../settings/appConfig'

beforeEach(() => {
  localStorage.clear()
  resetConfig()
})

describe('appConfig basics', () => {
  it('starts from defaults after reset', () => {
    expect(getAppConfig()).toMatchObject({ language: 'en', confirmDestructive: true })
    expect(getAppConfig().ai).toEqual(DEFAULT_CONFIG.ai)
  })

  it('merges shallow patches and deep-merges ai one level', () => {
    setAppConfig({ view: 'grid' })
    setAppConfig({ ai: { model: 'kimi-k2.5' } as never })
    const c = getAppConfig()
    expect(c.view).toBe('grid')
    expect(c.ai.model).toBe('kimi-k2.5')
    expect(c.ai.provider).toBe(DEFAULT_CONFIG.ai.provider) // preserved by deep merge
  })

  it('persists to localStorage and is readable', () => {
    setAppConfig({ theme: 'dracula' })
    expect(JSON.parse(localStorage.getItem('fm.config')!).theme).toBe('dracula')
  })
})

describe('normalizeConfig', () => {
  it('fills missing keys and coerces bad recents', () => {
    const n = normalizeConfig({ recents: 'nope' as never, language: 'it' })
    expect(n.language).toBe('it')
    expect(Array.isArray(n.recents)).toBe(true)
    expect(n.sort).toEqual(DEFAULT_CONFIG.sort)
    expect(n.ai.enabled).toBe(true)
  })
  it('merges partial ai without dropping the rest', () => {
    const n = normalizeConfig({ ai: { provider: 'ollama' } as never })
    expect(n.ai.provider).toBe('ollama')
    expect(n.ai.model).toBe(DEFAULT_CONFIG.ai.model)
    expect(n.ai.cloudOptIn).toBe(DEFAULT_CONFIG.ai.cloudOptIn)
  })
})

describe('export / import', () => {
  it('round-trips through JSON', () => {
    setAppConfig({ hiddenVisible: true })
    const json = exportConfig()
    expect(JSON.parse(json).hiddenVisible).toBe(true)
    resetConfig()
    expect(getAppConfig().hiddenVisible).toBe(DEFAULT_CONFIG.hiddenVisible)
    const r = importConfig(json)
    expect(r.ok).toBe(true)
    expect(getAppConfig().hiddenVisible).toBe(true)
  })
  it('rejects malformed JSON without changing config', () => {
    const before = getAppConfig()
    const r = importConfig('{ not json')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/JSON/i)
    expect(getAppConfig()).toEqual(before)
  })
  it('rejects non-object payloads', () => {
    expect(importConfig('"just a string"').ok).toBe(false)
    expect(importConfig('null').ok).toBe(false)
  })
})

describe('init / fallback', () => {
  it('initAppConfig resolves and keeps current state when store is absent', async () => {
    await expect(initAppConfig()).resolves.toBeUndefined()
    expect(getAppConfig().language).toBe(DEFAULT_CONFIG.language)
  })
})
