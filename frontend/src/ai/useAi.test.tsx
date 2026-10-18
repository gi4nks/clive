import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { FileEntry } from '../api.js'
import { DEFAULT_CONFIG, setAppConfig } from '../settings/appConfig.js'
import { setProviders } from './settings.js'
import * as runtime from './runtime.js'
import * as actions from './actions.js'
import * as fs from './fs.js'
import { useAi, type AiDeps } from './useAi.js'

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  undo: vi.fn(),
}))

vi.mock('./runtime.js', () => ({
  checkHealth: vi.fn(),
  listAvailableModels: vi.fn(),
}))

vi.mock('./actions.js', () => ({
  generateContent: vi.fn(),
  organizeToApply: vi.fn(),
  proposeOrganize: vi.fn(),
  proposeRenames: vi.fn(),
  summarize: vi.fn(),
}))

vi.mock('./fs.js', () => ({ collectFileContents: vi.fn() }))

vi.mock('./useAiProposal.js', () => ({
  useAiProposal: () => ({ apply: mocks.apply, undo: mocks.undo }),
}))

const files: FileEntry[] = [
  { name: 'a.txt', path: '/work/a.txt', isDir: false, size: 12, modified: 1, extension: 'txt' },
  { name: 'photo.jpg', path: '/work/photo.jpg', isDir: false, size: 20, modified: 2, extension: 'jpg' },
]

const deps: AiDeps = {
  currentPath: '/work',
  entries: files,
  selectedPaths: ['/work/a.txt'],
  guardOn: true,
  setStatus: vi.fn(),
  refresh: vi.fn(),
}

const healthy = { ok: true, providers: { ollama: true, remote: true } }
const models = [
  { id: 'llama3.2', name: 'Llama 3.2', provider: 'ollama' },
  { id: 'gpt-4o', name: 'GPT 4o', provider: 'remote' },
]

beforeEach(() => {
  setAppConfig({ ...DEFAULT_CONFIG, ai: { enabled: true, provider: 'ollama', model: 'llama3.2', cloudOptIn: true } })
  setProviders([
    { id: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', device: 'local', hasKey: false, keyPreview: null, cloud: false, builtin: true },
    { id: 'remote', baseUrl: 'https://api.example.test/v1', device: 'remote', hasKey: true, keyPreview: '•••', cloud: true, builtin: false },
  ])
  vi.mocked(runtime.checkHealth).mockReset().mockResolvedValue(healthy)
  vi.mocked(runtime.listAvailableModels).mockReset().mockResolvedValue(models)
  vi.mocked(fs.collectFileContents).mockReset().mockResolvedValue([{ path: '/work/a.txt', name: 'a.txt', content: 'hello' }])
  vi.mocked(actions.proposeRenames).mockReset().mockResolvedValue([
    { path: '/work/a.txt', proposed: 'notes.txt', resolved: { path: '/work/a.txt', from: 'a.txt', to: 'notes.txt', ok: true } },
  ])
  vi.mocked(actions.summarize).mockReset().mockResolvedValue('A short summary')
  vi.mocked(actions.proposeOrganize).mockReset().mockResolvedValue({ folders: ['Docs'], moves: [{ src: '/work/a.txt', dstFolder: 'Docs', dst: '/work/Docs/a.txt' }], unknown: [] })
  vi.mocked(actions.generateContent).mockReset().mockResolvedValue({ name: 'note.md', body: '# Note' })
  vi.mocked(actions.organizeToApply).mockReset().mockReturnValue({ folders: ['/work/Docs'], moves: [{ src: '/work/a.txt', dst: '/work/Docs/a.txt' }] })
  mocks.apply.mockReset().mockResolvedValue({ applied: 1, batchId: 'batch-1', failures: [] })
  mocks.undo.mockReset().mockResolvedValue({ applied: 1, failures: [] })
  vi.clearAllMocks()
})

describe('useAi orchestration', () => {
  it('loads models, proposes safe renames, applies the proposal, then undoes its batch', async () => {
    const { result } = renderHook(() => useAi(deps))
    expect(result.current.offline).toBe(true)

    await act(async () => { await result.current.requestRename([files[0]]) })
    expect(runtime.checkHealth).toHaveBeenCalledOnce()
    expect(runtime.listAvailableModels).toHaveBeenCalledOnce()
    expect(actions.proposeRenames).toHaveBeenCalledWith(
      expect.any(Array), ['a.txt', 'photo.jpg'], expect.objectContaining({ model: 'ollama/llama3.2' }),
    )
    expect(result.current.rows).toEqual([{ path: '/work/a.txt', from: 'a.txt', to: 'notes.txt', ok: true, error: undefined }])
    expect(result.current.providerModels).toEqual([models[0]])
    expect(result.current.offline).toBe(false)

    await act(async () => { await result.current.apply() })
    expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({ operations: [
      expect.objectContaining({ id: 'rename:0', kind: 'rename', path: '/work/a.txt', newName: 'notes.txt' }),
    ] }))
    expect(result.current.journal).toBe('batch-1')
    expect(deps.refresh).toHaveBeenCalledOnce()

    await act(async () => { await result.current.undo() })
    expect(mocks.undo).toHaveBeenCalledOnce()
    expect(result.current.journal).toBeNull()
  })

  it('summarizes text, rejects unsupported image-only summaries, and reports empty model output', async () => {
    const { result } = renderHook(() => useAi(deps))
    await act(async () => { await result.current.requestSummarize([files[0]]) })
    expect(result.current.summary).toBe('A short summary')
    expect(result.current.hasPreview).toBe(true)

    const imageOnly = [files[1]]
    await act(async () => { await result.current.requestSummarize(imageOnly) })
    expect(actions.summarize).toHaveBeenCalledOnce()
    expect(deps.setStatus).toHaveBeenCalledWith(expect.stringContaining('image'), 'error')

    vi.mocked(actions.summarize).mockResolvedValueOnce('  ')
    await act(async () => { await result.current.requestSummarize([files[0]]) })
    expect(result.current.error).toContain('returned no text')
  })

  it('organizes selected files, allows excluding a move, and clears preview on cancel', async () => {
    const { result } = renderHook(() => useAi(deps))
    await act(async () => { await result.current.requestOrganize([files[0]]) })
    expect(result.current.organize?.moves).toHaveLength(1)
    act(() => result.current.toggleExcluded('/work/a.txt'))
    expect(result.current.excluded.has('/work/a.txt')).toBe(true)
    vi.mocked(actions.organizeToApply).mockReturnValueOnce({ folders: ['/work/Docs'], moves: [] })
    await act(async () => { await result.current.apply() })
    expect(actions.organizeToApply).toHaveBeenCalledWith(expect.objectContaining({ moves: [] }), '/work')
    expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({ operations: [
      expect.objectContaining({ kind: 'createFolder', path: '/work/Docs' }),
    ] }))
    act(() => result.current.cancel())
    expect(result.current.hasPreview).toBe(false)
    expect(result.current.excluded.has('/work/a.txt')).toBe(true)
  })

  it('generates a file only after preview and validates the name before apply', async () => {
    const { result } = renderHook(() => useAi(deps))
    await act(async () => { await result.current.requestGenerate('write a note') })
    expect(result.current.gen).toEqual({ name: 'note.md', body: '# Note' })
    act(() => result.current.setGen({ name: '../escape', body: 'unsafe' }))
    await act(async () => { await result.current.apply() })
    expect(mocks.apply).not.toHaveBeenCalled()
    expect(deps.setStatus).toHaveBeenCalledWith(expect.stringContaining('valid'), 'error')

    act(() => result.current.setGen({ name: 'safe.md', body: '# Safe' }))
    await act(async () => { await result.current.apply() })
    expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({ operations: [
      expect.objectContaining({ kind: 'createFile', path: '/work/safe.md', content: '# Safe' }),
    ] }))
    expect(deps.refresh).toHaveBeenCalledOnce()
  })

  it('supports multi-rename, partial failures, cancellation, and no-op apply', async () => {
    const { result } = renderHook(() => useAi(deps))
    await act(async () => { await result.current.runMultiRename([{ path: files[0].path, newName: 'new.txt' }]) })
    expect(result.current.journal).toBe('batch-1')

    mocks.apply.mockResolvedValueOnce({ applied: 0, batchId: 'batch-2', failures: [{ error: 'permission denied' }] })
    await act(async () => { await result.current.runMultiRename([{ path: files[0].path, newName: 'other.txt' }]) })
    expect(deps.setStatus).toHaveBeenCalledWith(expect.stringMatching(/error/i), 'error')

    result.current.setRows([{ path: files[0].path, from: 'a.txt', to: 'a.txt', ok: true }])
    await waitFor(() => expect(result.current.rows).toHaveLength(1))
    await act(async () => { await result.current.apply() })
    expect(result.current.rows).toHaveLength(1)
    act(() => result.current.cancel())
    expect(result.current.rows).toBeNull()
    expect(result.current.summary).toBe('')
  })

  it('handles disabled AI, cloud opt-in, an unreachable provider, and abort without a stale error', async () => {
    setAppConfig({ ai: { enabled: false } })
    const disabled = renderHook(() => useAi(deps))
    await act(async () => { await disabled.result.current.requestGenerate('prompt') })
    expect(actions.generateContent).not.toHaveBeenCalled()
    disabled.unmount()

    setAppConfig({ ai: { enabled: true, provider: 'remote', model: 'gpt-4o', cloudOptIn: false } })
    setProviders([
      { id: 'remote', baseUrl: 'https://api.example.test/v1', device: 'remote', hasKey: true, keyPreview: '•••', cloud: true, builtin: false },
    ])
    const cloudBlocked = renderHook(() => useAi(deps))
    await act(async () => { await cloudBlocked.result.current.requestGenerate('prompt') })
    expect(cloudBlocked.result.current.error).toContain('Cloud is disabled')
    cloudBlocked.unmount()

    setAppConfig({ ai: { enabled: true, provider: 'ollama', model: 'llama3.2', cloudOptIn: true } })
    vi.mocked(runtime.checkHealth).mockResolvedValueOnce({ ok: false, providers: {} })
    const offline = renderHook(() => useAi(deps))
    await act(async () => { await offline.result.current.requestGenerate('prompt') })
    expect(offline.result.current.error).toContain('Provider unreachable')
    offline.unmount()
  })
})
