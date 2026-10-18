import { beforeEach, describe, expect, it, vi } from 'vitest'

const storeMocks = vi.hoisted(() => ({
  load: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  save: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-store', () => ({ load: storeMocks.load }))

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  vi.clearAllMocks()
  storeMocks.load.mockResolvedValue({ get: storeMocks.get, set: storeMocks.set, save: storeMocks.save })
  storeMocks.get.mockResolvedValue(null)
  storeMocks.set.mockResolvedValue(undefined)
  storeMocks.save.mockResolvedValue(undefined)
})

describe('appConfig native store synchronization', () => {
  it('hydrates and normalizes native preferences, persists the snapshot, and notifies listeners', async () => {
    storeMocks.get.mockResolvedValue({
      language: 'it',
      ai: { enabled: false },
      colWidths: { left: { name: 400 } },
      paneCollapsed: { left: true },
      remoteLocations: [
        { id: 'valid', name: 'Drive', path: '/Drive', kind: 'local-sync' },
        { id: 'invalid', name: 'Broken', path: '/Broken', kind: 'ftp' },
      ],
    })
    const config = await import('./appConfig')
    const listener = vi.fn()
    config.subscribe(listener)

    await config.initAppConfig()

    expect(config.getAppConfig()).toMatchObject({
      language: 'it',
      ai: { enabled: false, provider: '', cloudOptIn: true },
      colWidths: { left: { name: 400, size: 120 }, right: { name: 280, size: 120 } },
      paneCollapsed: { left: true, right: false },
      remoteLocations: [{ id: 'valid', name: 'Drive', path: '/Drive', kind: 'local-sync' }],
    })
    expect(JSON.parse(localStorage.getItem('fm.config')!).language).toBe('it')
    expect(listener).toHaveBeenCalledOnce()
  })

  it('seeds an empty native store with defaults', async () => {
    const config = await import('./appConfig')

    await config.initAppConfig()

    expect(storeMocks.set).toHaveBeenCalledWith('config', config.DEFAULT_CONFIG)
  })

  it('keeps local preferences when native hydration fails', async () => {
    storeMocks.get.mockRejectedValue(new Error('store unavailable'))
    const config = await import('./appConfig')
    config.setAppConfig({ language: 'it' })

    await expect(config.initAppConfig()).resolves.toBeUndefined()

    expect(config.getAppConfig().language).toBe('it')
  })

  it('loads legacy preferences and falls back from malformed legacy JSON', async () => {
    localStorage.setItem('fm.lang', 'it')
    localStorage.setItem('fm.theme', 'dark')
    localStorage.setItem('fm.view', 'not-json')
    localStorage.setItem('fm.sort', JSON.stringify({ key: 'modified', dir: -1 }))
    localStorage.setItem('fm.sidebar.width', 'not-json')
    localStorage.setItem('fm.recents', JSON.stringify(['/tmp/Recent']))
    localStorage.setItem('fm.home', '/tmp/Home')
    localStorage.setItem('fm.hidden', '1')
    localStorage.setItem('fm.ai.settings', JSON.stringify({ provider: 'ollama', model: 'local' }))
    vi.resetModules()

    const config = await import('./appConfig')
    expect(config.getAppConfig()).toMatchObject({
      language: 'it', theme: 'dark', view: 'list', sort: { key: 'modified', dir: -1 },
      sidebarWidth: 200, recents: ['/tmp/Recent'], home: '/tmp/Home', hiddenVisible: true,
      ai: { provider: 'ollama', model: 'local' },
    })
  })
})
