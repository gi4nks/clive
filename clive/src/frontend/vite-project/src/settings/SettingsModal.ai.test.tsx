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
import { setProviders } from '../ai/settings'
import { setAppConfig } from './appConfig'

beforeEach(async () => {
  cleanup()
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
  render(<SettingsModal open onClose={vi.fn()} />)
  fireEvent.click(screen.getByText('AI'))
}

describe('Settings AI master-detail', () => {
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
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    openAiTab()
    fireEvent.click(screen.getByText('openrouter'))
    fireEvent.click(screen.getByText('Remove provider'))
    await waitFor(() => expect(mocks.aiRemoveProvider).toHaveBeenCalledWith('openrouter'))
    fireEvent.click(screen.getByText('OpenCode Go'))
    fireEvent.click(screen.getByText('Use as default'))
    expect(setAppConfig && (await import('./appConfig')).getAppConfig().ai.provider).toBe('opencode-go')
  })
})
