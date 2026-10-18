// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../i18n'
import { AiWidget } from './AiWidget.js'
import { setProviders } from './settings.js'
import type { WidgetCtx } from '../widgetTypes.js'

afterEach(cleanup)
beforeEach(() => setProviders([
  { id: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', device: 'local', hasKey: false, keyPreview: null, cloud: false, builtin: true },
  { id: 'remote', baseUrl: 'https://api.example.test/v1', device: 'remote', hasKey: true, keyPreview: '•••', cloud: true, builtin: false },
]))

function ctx(overrides: Record<string, unknown> = {}) {
  const file = { name: 'a.txt', path: '/work/a.txt', isDir: false, size: 1, modified: 1, extension: 'txt' }
  const ai = {
    sel: { provider: 'ollama', model: 'llama3.2' }, health: { ok: true, providers: { ollama: true } },
    providerOk: true, gatewayDown: false, offline: false, busy: null, error: '',
    refresh: vi.fn(), abort: vi.fn(), requestRename: vi.fn(), requestOrganize: vi.fn(),
    requestSummarize: vi.fn(), requestGenerate: vi.fn(),
  }
  return { ai, selectedEntries: [file], ...overrides } as unknown as WidgetCtx
}

describe('AiWidget', () => {
  it('opens the provider panel, refreshes health lazily, and starts selected-file actions', () => {
    const value = ctx({ ai: { ...ctx().ai, health: null } })
    render(<AiWidget ctx={value} />)
    fireEvent.click(screen.getByTitle('AI Assistant'))
    expect(value.ai.refresh).toHaveBeenCalledOnce()
    expect(screen.getByText('online')).toBeInTheDocument()
    expect(screen.getByText('Ollama (local) · llama3.2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    expect(value.ai.requestRename).toHaveBeenCalledWith(value.selectedEntries)
    fireEvent.click(screen.getByRole('button', { name: 'Organize' }))
    expect(value.ai.requestOrganize).toHaveBeenCalledWith(value.selectedEntries)
    fireEvent.click(screen.getByRole('button', { name: 'Summarize' }))
    expect(value.ai.requestSummarize).toHaveBeenCalledWith(value.selectedEntries)
    fireEvent.change(screen.getByPlaceholderText('Describe the file to create…'), { target: { value: 'draft a report' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate file' }))
    expect(value.ai.requestGenerate).toHaveBeenCalledWith('draft a report')
  })

  it('shows cloud privacy notice and disables selected-file actions without a selection', () => {
    const value = ctx({
      selectedEntries: [],
      ai: { ...ctx().ai, sel: { provider: 'remote', model: 'gpt-4o' }, providerOk: false, health: { ok: false, providers: {} }, gatewayDown: true, offline: true },
    })
    render(<AiWidget ctx={value} />)
    fireEvent.click(screen.getByTitle('AI Assistant'))
    expect(screen.getByText(/contents of selected files leave this machine/)).toBeInTheDocument()
    expect(screen.getByText('offline')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Organize' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Summarize' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Generate file' })).toBeDisabled()
  })

  it('uses abort for an active request and hides the prompt while generation is running', () => {
    const base = ctx()
    const value = ctx({ ai: { ...base.ai, busy: 'generate' } })
    render(<AiWidget ctx={value} />)
    fireEvent.click(screen.getByTitle('AI Assistant'))
    expect(screen.queryByPlaceholderText('Describe the file to create…')).toBeNull()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })
})
