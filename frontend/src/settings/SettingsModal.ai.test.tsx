// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import i18n from '../i18n'

const mocks = vi.hoisted(() => ({
  aiGetConfig: async () => [
    { id: 'ollama', baseUrl: 'http://localhost:11434/v1', device: '/dev/disk3s1', hasKey: false, keyPreview: null, cloud: false, builtin: true },
    { id: 'opencode-go', baseUrl: 'https://opencode.ai/zen/go/v1', device: 'web', hasKey: true, keyPreview: 'sk-1…9999', cloud: true, builtin: true },
    { id: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', device: 'web', hasKey: false, keyPreview: null, cloud: true, builtin: false },
  ],
  aiSetProvider: vi.fn(async () => undefined),
  aiAddProvider: vi.fn(async () => undefined),
  aiRemoveProvider: vi.fn(async () => undefined),
  buildInfo: vi.fn(async () => ({ version: '1.0.0', buildEpoch: 0 })),
}))

vi.mock('../api', async (io) => ({ ...(await io<typeof import('../api')>()), ...mocks }))
vi.mock('../ai/runtime', () => ({
  checkHealth: async () => ({ ok: true, providers: { ollama: true, 'opencode-go': false, openrouter: true } }),
  listAvailableModels: async () => [{ id: 'llama3', name: 'llama3', provider: 'ollama' }],
}))

import { SettingsModal } from './SettingsModal'
import { ConfirmDialog } from '../ConfirmDialog'
import { setProviders } from '../ai/settings'
import { resetConfig, setAppConfig } from './appConfig'

beforeEach(async () => {
  cleanup()
  resetConfig()
  setProviders([
    { id: 'ollama', baseUrl: 'http://localhost:11434/v1', device: '/dev/disk3s1', hasKey: false, keyPreview: null, cloud: false, builtin: true },
    { id: 'opencode-go', baseUrl: 'https://opencode.ai/zen/go/v1', device: 'web', hasKey: true, keyPreview: 'sk-1…9999', cloud: true, builtin: true },
    { id: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', device: 'web', hasKey: false, keyPreview: null, cloud: true, builtin: false },
  ])
  setAppConfig({ ai: { cloudOptIn: true, provider: 'ollama', model: 'llama3' } })
  await i18n.changeLanguage('en')
})
afterEach(() => cleanup())

const openAiTab = () => {
  render(
    <>
      <SettingsModal open onClose={vi.fn()} />
      <ConfirmDialog />
    </>,
  )
  fireEvent.click(screen.getByText('AI'))
}

describe('Settings AI master-detail', () => {
  it('persists the master switch while keeping provider settings available', async () => {
    openAiTab()
    const toggle = screen.getByRole('checkbox', { name: 'Enable AI features' })
    fireEvent.click(toggle)
    expect((await import('./appConfig')).getAppConfig().ai.enabled).toBe(false)
    expect(screen.getByTestId('ai-provider-detail')).toBeInTheDocument()
    fireEvent.click(toggle)
    expect((await import('./appConfig')).getAppConfig().ai.enabled).toBe(true)
  })

  it('shows a single detail panel and switches it on provider selection', async () => {
    openAiTab()
    await waitFor(() => expect(screen.getByTestId('ai-provider-detail')).toBeInTheDocument())
    expect(screen.getByTestId('ai-provider-detail').textContent).toContain('Ollama (local)')
    expect(screen.queryAllByTestId('ai-provider-detail')).toHaveLength(1)
    fireEvent.click(screen.getByText('openrouter'))
    await waitFor(() => expect(screen.getByTestId('ai-provider-detail').textContent).toContain('openrouter'))
    expect(screen.getByText('custom')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Ollama (local)'))
    await waitFor(() => expect(screen.getByTestId('ai-provider-detail').textContent).toContain('Ollama (local)'))
    expect(screen.queryByText('Remove provider')).not.toBeInTheDocument()

  })

  it('removes only via detail and applies default', async () => {
    openAiTab()
    fireEvent.click(screen.getByText('openrouter'))
    fireEvent.click(screen.getByText('Remove provider'))
    await waitFor(() => expect(document.querySelector('[data-confirm-dialog]')).not.toBeNull())
    fireEvent.click([...document.querySelectorAll('[data-confirm-dialog] .modal-box button')].at(-1)!)
    await waitFor(() => expect(mocks.aiRemoveProvider).toHaveBeenCalledWith('openrouter'))
    fireEvent.click(screen.getByText('OpenCode Go'))
    fireEvent.click(screen.getByText('Use as default'))
    expect(setAppConfig && (await import('./appConfig')).getAppConfig().ai.provider).toBe('opencode-go')
  })
})

describe('Settings general, file, and advanced tabs', () => {
  const openSettings = () => render(<><SettingsModal open onClose={vi.fn()} /><ConfirmDialog /></>)

  it('updates language, theme, view, sort, visibility, and preview preferences', async () => {
    openSettings()
    fireEvent.click(screen.getByRole('tab', { name: 'General' }))
    const generalSelects = screen.getAllByRole('combobox')
    fireEvent.change(generalSelects[0], { target: { value: 'it' } })
    fireEvent.change(generalSelects[1], { target: { value: 'dark' } })
    expect((await import('./appConfig')).getAppConfig().language).toBe('it')
    expect((await import('./appConfig')).getAppConfig().theme).toBe('dark')
    await i18n.changeLanguage('en')

    fireEvent.click(screen.getByRole('tab', { name: 'File' }))
    const fileSelects = screen.getAllByRole('combobox')
    fireEvent.change(fileSelects[0], { target: { value: 'grid' } })
    fireEvent.change(fileSelects[1], { target: { value: 'modified' } })
    expect((await import('./appConfig')).getAppConfig().view).toBe('grid')
    expect((await import('./appConfig')).getAppConfig().sort.key).toBe('modified')
    const showHidden = screen.getByText('Show hidden files').parentElement!.querySelector('input')!
    const preview = screen.getByText('Preview panel').parentElement!.querySelector('input')!
    fireEvent.click(showHidden)
    fireEvent.click(preview)
    expect((await import('./appConfig')).getAppConfig().hiddenVisible).toBe(showHidden.checked)
    expect((await import('./appConfig')).getAppConfig().previewPanel).toBe(preview.checked)
  })

  it('adds synced and SMB locations only after required fields are present', async () => {
    openSettings()
    fireEvent.click(screen.getByRole('tab', { name: 'File' }))
    fireEvent.change(screen.getByPlaceholderText('Name (e.g. NAS)'), { target: { value: 'Synology' } })
    fireEvent.change(screen.getByPlaceholderText('Local path (e.g. ~/SynologyDrive)'), { target: { value: '/Users/test/Drive' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add folder' }))
    expect((await import('./appConfig')).getAppConfig().remoteLocations).toHaveLength(1)
    expect(screen.getByText('Synology')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect((await import('./appConfig')).getAppConfig().remoteLocations).toHaveLength(0)

    fireEvent.change(screen.getByPlaceholderText('Name (e.g. NAS)'), { target: { value: 'NAS' } })
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'smb' } })
    const add = screen.getByRole('button', { name: 'Add folder' })
    expect(add).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('Local path (e.g. ~/SynologyDrive)'), { target: { value: '/Volumes/NAS' } })
    fireEvent.change(screen.getByPlaceholderText('SMB address (e.g. smb://nas.local/NAS)'), { target: { value: 'not-smb' } })
    fireEvent.click(add)
    expect((await import('./appConfig')).getAppConfig().remoteLocations).toHaveLength(0)
    fireEvent.change(screen.getByPlaceholderText('SMB address (e.g. smb://nas.local/NAS)'), { target: { value: 'smb://nas.local/share' } })
    fireEvent.click(add)
    expect((await import('./appConfig')).getAppConfig().remoteLocations[0].endpoint).toBe('smb://nas.local/share')
  })

  it('clamps advanced dimensions and reports invalid imports', async () => {
    openSettings()
    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }))
    fireEvent.change(screen.getByDisplayValue('200'), { target: { value: '900' } })
    expect((await import('./appConfig')).getAppConfig().sidebarWidth).toBe(560)
    const file = new File(['invalid json'], 'settings.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => 'invalid json' })
    const input = document.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: [file] } })
    expect(await screen.findByText('Import failed')).toBeInTheDocument()
  })

  it('imports valid settings and applies them to the live configuration', async () => {
    openSettings()
    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }))
    const payload = JSON.stringify({ sidebarWidth: 340, view: 'grid', ai: { enabled: false } })
    const file = new File([payload], 'settings.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => payload })
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })
    expect(await screen.findByText('Configuration imported')).toBeInTheDocument()
    const config = (await import('./appConfig')).getAppConfig()
    expect(config.sidebarWidth).toBe(340)
    expect(config.view).toBe('grid')
    expect(config.ai.enabled).toBe(false)
  })

  it('requires confirmation before disabling system guards or resetting settings', async () => {
    openSettings()
    fireEvent.click(screen.getByRole('tab', { name: 'File' }))
    const guard = screen.getByText('Protect macOS system locations').parentElement!.querySelector('input')!
    fireEvent.click(guard)
    expect(await screen.findByText(/Turning this off lets you rename or delete system folders/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect((await import('./appConfig')).getAppConfig().guardSystemLocations).toBe(true)

    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(await screen.findByText('Restore default settings?')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset' }).at(-1)!)
    await waitFor(async () => expect((await import('./appConfig')).getAppConfig().sidebarWidth).toBe(200))
  })
})
