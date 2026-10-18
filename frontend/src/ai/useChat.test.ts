import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChat } from './useChat.js'
import { CANCELLED_SENTINEL } from './chat.js'
import * as runtime from './runtime.js'
import * as fsBridge from './fs.js'
import * as api from '../api.js'
import { setAppConfig } from '../settings/appConfig.js'
vi.mock('./reviewProposal.js', () => ({ reviewProposal: vi.fn(async () => true) }))

vi.mock('./runtime.js', () => ({
  streamChat: vi.fn(),
}))

vi.mock('./fs.js', () => ({
  collectFileContents: vi.fn(async () => []),
}))

vi.mock('../api.js', () => ({
  applyPlan: vi.fn(async (_batchId: string, ops: { id: string }[]) => ({ applied: ops.length, skipped: 0, failed: [], batchId: 'test-batch' })),
  undoPlan: vi.fn(),
  listVolumes: vi.fn(async () => []),
  listDir: vi.fn(async () => []),
  readTextFile: vi.fn(async () => ''),
}))

function fakeStream(chunks: string[]) {
  return vi.fn(async function* () {
    for (const c of chunks) yield c
  })
}

function streamTrash(file: string) {
  return fakeStream([`x\n<<<ACTIONS>>>\n${JSON.stringify({ actions: [{ type: 'trash', file }] })}\n<<<END>>>`])()
}

beforeEach(() => {
  setAppConfig({ ai: { enabled: true } })
  vi.mocked(runtime.streamChat).mockReset()
  vi.mocked(fsBridge.collectFileContents).mockClear()
  vi.mocked(api.applyPlan).mockClear()
  vi.mocked(api.applyPlan).mockImplementation(async (_batchId, ops) => ({ applied: ops.length, skipped: 0, failed: [], batchId: 'test-batch' }))
})

describe('useChat', () => {
  const deps = () => ({
    currentPath: '/d',
    entries: [] as never[],
    selected: [] as never[],
    model: 'opencode-go/x',
    guardOn: true,
    setStatus: vi.fn(),
    refresh: vi.fn(),
  })

  it('does not start a chat when the AI master switch is disabled', async () => {
    setAppConfig({ ai: { enabled: false } })
    const { result } = renderHook(() => useChat(deps()))
    await act(async () => { await result.current.send('hello') })
    expect(runtime.streamChat).not.toHaveBeenCalled()
    expect(result.current.messages).toHaveLength(0)
  })

  it('appends user msg, streams assistant chunks, finalizes with actions parsed', async () => {
    vi.mocked(runtime.streamChat).mockReturnValue(
      fakeStream(['Hi ', 'there.\n<<<ACTIONS>>>\n{"actions":[{"type":"trash","file":"/d/a"}]}\n<<<END>>>'])() as never,
    )
    const { result } = renderHook(() => useChat(deps()))
    await act(async () => {
      await result.current.send('hello')
    })
    const msgs = result.current.messages
    expect(msgs[0]).toMatchObject({ role: 'user', content: 'hello' })
    expect(msgs[1].role).toBe('assistant')
    expect(msgs[1].content).toBe('Hi there.')
    expect(msgs[1].actions).toEqual([{ type: 'trash', file: '/d/a' }])
    expect(msgs[1].streaming).toBe(false)
  })

  it('renders the dir listing into the prompt from deps.entries', async () => {
    vi.mocked(runtime.streamChat).mockReturnValue(fakeStream(['ok'])() as never)
    const d = {
      ...deps(),
      entries: [
        { name: 'a.txt', path: '/d/a.txt', isDir: false, size: 1, modified: 0, extension: 'txt' },
        { name: 'sub', path: '/d/sub', isDir: true, size: 0, modified: 0, extension: null },
      ] as never[],
    }
    const { result } = renderHook(() => useChat(d))
    await act(async () => {
      await result.current.send('ls?')
    })
    const call = vi.mocked(runtime.streamChat).mock.calls.at(-1)?.[0]
    expect(call?.prompt).toContain('a.txt')
    expect(call?.prompt).toContain('sub/')
  })

  it('keeps the complete streamed text and reports provider length truncation', async () => {
    const stream = vi.fn(async function* (args: { onFinish?: (meta: { finishReason: string }) => void }) {
      yield 'part one '
      yield 'part two'
      args.onFinish?.({ finishReason: 'length' })
    })
    const { result } = renderHook(() => useChat({ ...deps(), streamChat: stream as never }))
    await act(async () => { await result.current.send('long answer') })
    expect(result.current.messages[1].content).toBe('part one part two')
    expect(result.current.error).toContain('output')
  })

  it('does not execute anything without applyAction', async () => {
    vi.mocked(runtime.streamChat).mockReturnValue(streamTrash('/d/a') as never)
    const { result } = renderHook(() => useChat(deps()))
    await act(async () => {
      await result.current.send('go')
    })
    expect(result.current.messages[1].actions?.[0]).toMatchObject({ type: 'trash' })
    expect(result.current.messages[1].actionsApplied?.[0]).toBeFalsy()
    expect(api.applyPlan).not.toHaveBeenCalled()
  })

  it('applyAction(trash) calls the Rust batch executor, marks applied, refreshes', async () => {
    vi.mocked(runtime.streamChat).mockReturnValue(streamTrash('/d/a') as never)
    const d = deps()
    const { result } = renderHook(() => useChat(d))
    await act(async () => {
      await result.current.send('go')
    })
    await act(async () => {
      await result.current.applyAction(1, 0)
    })
    expect(api.applyPlan).toHaveBeenCalledWith(expect.any(String), [{ id: 'chat:0:trash', kind: 'trash', path: '/d/a', included: true }])
    expect(result.current.messages[1].actionsApplied?.[0]).toBe(true)
    expect(d.refresh).toHaveBeenCalled()
  })

  it('applyAction(rename) routes through the Rust batch executor', async () => {
    vi.mocked(runtime.streamChat).mockReturnValue(
      fakeStream(['<<<ACTIONS>>>\n{"actions":[{"type":"rename","file":"/d/a.txt","newName":"b.txt"}]}\n<<<END>>>'])() as never,
    )
    const { result } = renderHook(() => useChat(deps()))
    await act(async () => {
      await result.current.send('go')
    })
    await act(async () => {
      await result.current.applyAction(1, 0)
    })
    expect(api.applyPlan).toHaveBeenCalledWith(expect.any(String), [{ id: 'chat:0:rename', kind: 'rename', path: '/d/a.txt', newName: 'b.txt', included: true }])
  })

  it('applyAction(createFolder) sends every parent folder to Rust in order-independent form', async () => {
    vi.mocked(runtime.streamChat).mockReturnValue(
      fakeStream(['<<<ACTIONS>>>\n{"actions":[{"type":"createFolder","folder":"Organizzato/00 Inbox"}]}\n<<<END>>>'])() as never,
    )
    const { result } = renderHook(() => useChat(deps()))
    await act(async () => {
      await result.current.send('go')
    })
    await act(async () => {
      await result.current.applyAction(1, 0)
    })
    expect(api.applyPlan).toHaveBeenCalledWith(expect.any(String), [
      { id: 'chat:0:create-folder:parent:0', kind: 'createFolder', path: '/d/Organizzato', included: true },
      { id: 'chat:0:create-folder:parent:1', kind: 'createFolder', path: '/d/Organizzato/00 Inbox', included: true },
    ])
  })

  it('applyAction(organize) creates the folder and moves the file', async () => {
    vi.mocked(runtime.streamChat).mockReturnValue(
      fakeStream(['<<<ACTIONS>>>\n{"actions":[{"type":"organize","file":"/d/a.txt","dstFolder":"docs"}]}\n<<<END>>>'])() as never,
    )
    const { result } = renderHook(() => useChat(deps()))
    await act(async () => {
      await result.current.send('go')
    })
    await act(async () => {
      await result.current.applyAction(1, 0)
    })
    expect(api.applyPlan).toHaveBeenCalledWith(expect.any(String), [
      { id: 'chat:0:folder:parent:0', kind: 'createFolder', path: '/d/docs', included: true },
      { id: 'chat:0:move', kind: 'move', path: '/d/a.txt', destDir: '/d/docs', included: true },
    ])
  })

  it('applyAction(create) creates the file through the journaled Rust executor', async () => {
    vi.mocked(runtime.streamChat).mockReturnValue(
      fakeStream(['<<<ACTIONS>>>\n{"actions":[{"type":"create","file":"/d/note.md","content":"hi"}]}\n<<<END>>>'])() as never,
    )
    const { result } = renderHook(() => useChat(deps()))
    await act(async () => {
      await result.current.send('go')
    })
    await act(async () => {
      await result.current.applyAction(1, 0)
    })
    expect(api.applyPlan).toHaveBeenCalledWith(expect.any(String), [{ id: 'chat:0:create-file', kind: 'createFile', path: '/d/note.md', content: 'hi', included: true }])
  })

  it('applyAction records fs failures in actionErrors without marking applied', async () => {
    vi.mocked(runtime.streamChat).mockReturnValue(streamTrash('/d/a') as never)
    vi.mocked(api.applyPlan).mockResolvedValueOnce({ applied: 0, skipped: 0, failed: [{ id: 'chat:0:trash', code: 'filesystem', error: 'boom' }], batchId: 'test-batch' })
    const { result } = renderHook(() => useChat(deps()))
    await act(async () => {
      await result.current.send('go')
    })
    await act(async () => {
      await result.current.applyAction(1, 0)
    })
    expect(result.current.messages[1].actionErrors?.[0]).toContain('boom')
    expect(result.current.messages[1].actionsApplied?.[0]).toBeFalsy()
  })

  it('omits images when model lacks vision and notes the skip', async () => {
    vi.mocked(runtime.streamChat).mockReturnValue(fakeStream(['ok'])() as never)
    const d = {
      ...deps(),
      selected: [
        { name: 'notes.txt', path: '/d/notes.txt', isDir: false, size: 4, modified: 0, extension: 'txt' },
        { name: 'photo.png', path: '/d/photo.png', isDir: false, size: 100, modified: 0, extension: 'png' },
      ] as never[],
    }
    const { result } = renderHook(() => useChat(d))
    await act(async () => {
      await result.current.send('what here?')
    })
    expect(fsBridge.collectFileContents).toHaveBeenCalledWith([
      { name: 'notes.txt', path: '/d/notes.txt', isDir: false, size: 4, modified: 0, extension: 'txt' },
    ])
    expect(d.setStatus).toHaveBeenCalledWith(expect.stringContaining('ignor'), 'info')
  })

  it('applyAction refuses a guarded action without touching the fs', async () => {
    vi.mocked(runtime.streamChat).mockReturnValue(streamTrash('/System') as never)
    const d = deps()
    const { result } = renderHook(() => useChat(d))
    await act(async () => {
      await result.current.send('go')
    })
    await act(async () => {
      await result.current.applyAction(1, 0)
    })
    expect(api.applyPlan).not.toHaveBeenCalled()
    expect(result.current.messages[1].actionErrors?.[0]).toContain('system')
    expect(d.setStatus).toHaveBeenCalledWith(expect.stringContaining('system'), 'error')
  })

  it('drops a second send while the first stream is still open', async () => {
    vi.mocked(runtime.streamChat).mockImplementation(
      (async function* () {
        yield 'a'
        await new Promise((r) => setTimeout(r, 20))
        yield 'b'
      }) as never,
    )
    const { result } = renderHook(() => useChat(deps()))
    await act(async () => {
      const p1 = result.current.send('first')
      const p2 = result.current.send('second')
      await Promise.all([p1, p2])
    })
    expect(runtime.streamChat).toHaveBeenCalledTimes(1)
    expect(result.current.messages.length).toBe(2)
    expect(result.current.messages[0].content).toBe('first')
    expect(result.current.messages[1].content).toBe('ab')
    expect(result.current.streaming).toBe(false)
  })

  it('applyAction ignores a double-click: Rust batch runs once', async () => {
    vi.mocked(runtime.streamChat).mockReturnValue(streamTrash('/d/a') as never)
    const { result } = renderHook(() => useChat(deps()))
    await act(async () => {
      await result.current.send('go')
    })
    vi.mocked(api.applyPlan).mockImplementationOnce(
      async (_batchId, ops) => new Promise((r) => setTimeout(() => r({ applied: ops.length, skipped: 0, failed: [], batchId: 'test-batch' }), 10)),
    )
    await act(async () => {
      const p1 = result.current.applyAction(1, 0)
      const p2 = result.current.applyAction(1, 0)
      await Promise.all([p1, p2])
    })
    expect(api.applyPlan).toHaveBeenCalledTimes(1)
    expect(result.current.messages[1].actionsApplied?.[0]).toBe(true)
  })

  it('cancelAction stores CANCELLED_SENTINEL (contract pinned with ChatDrawer)', async () => {
    vi.mocked(runtime.streamChat).mockReturnValue(streamTrash('/d/a') as never)
    const { result } = renderHook(() => useChat(deps()))
    await act(async () => {
      await result.current.send('go')
    })
    act(() => {
      result.current.cancelAction(1, 0)
    })
    expect(result.current.messages[1].actionErrors?.[0]).toBe(CANCELLED_SENTINEL)
    expect(result.current.messages[1].actionsApplied?.[0]).toBe(true)
  })

  it('validateAction pre-validates a proposed action without touching the fs', async () => {
    vi.mocked(runtime.streamChat).mockReturnValue(
      fakeStream(['<<<ACTIONS>>>\n{"actions":[{"type":"create","file":"/d/note.md","content":"hi"}]}\n<<<END>>>'])() as never,
    )
    const d = {
      ...deps(),
      entries: [{ name: 'note.md', path: '/d/note.md', isDir: false, size: 1, modified: 0, extension: 'md' }] as never[],
    }
    const { result } = renderHook(() => useChat(d))
    await act(async () => {
      await result.current.send('go')
    })
    const v = result.current.validateAction(1, 0)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.error).toMatch(/already exists/i)
    expect(api.applyPlan).not.toHaveBeenCalled()
  })

  it('sets historyTruncated when the conversation overflows and clears it on reset', async () => {
    vi.mocked(runtime.streamChat).mockReturnValue(fakeStream(['ok'])() as never)
    const { result } = renderHook(() => useChat(deps()))
    await act(async () => {
      await result.current.send('x'.repeat(13000))
    })
    expect(result.current.historyTruncated).toBe(false)
    await act(async () => {
      await result.current.send('again')
    })
    expect(result.current.historyTruncated).toBe(true)
    act(() => {
      result.current.reset()
    })
    expect(result.current.historyTruncated).toBe(false)
  })

  it('reset() aborts an in-flight stream', async () => {
    let sig: AbortSignal | undefined
    vi.mocked(runtime.streamChat).mockImplementation(
      (async function* (args: { signal?: AbortSignal }) {
        sig = args.signal
        yield 'a'
        await new Promise((r) => setTimeout(r, 30))
        if (args.signal?.aborted) throw new Error('abort')
        yield 'b'
      }) as never,
    )
    const { result } = renderHook(() => useChat(deps()))
    let inflight: Promise<void> | undefined
    await act(async () => {
      inflight = result.current.send('go')
      await new Promise((r) => setTimeout(r, 5))
    })
    expect(result.current.streaming).toBe(true)
    act(() => {
      result.current.reset()
    })
    expect(sig?.aborted).toBe(true)
    await act(async () => {
      await inflight
    })
    expect(result.current.messages.length).toBe(0)
    expect(result.current.streaming).toBe(false)
  })
})
