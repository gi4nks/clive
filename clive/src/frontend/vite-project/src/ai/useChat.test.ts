import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChat } from './useChat.js'
import { CANCELLED_SENTINEL } from './chat.js'
import * as runtime from './runtime.js'
import * as fsBridge from './fs.js'

vi.mock('./runtime.js', () => ({
  streamChat: vi.fn(),
}))

vi.mock('./fs.js', () => ({
  fs: {
    exists: vi.fn(async () => true),
    rename: vi.fn(async () => {}),
    move: vi.fn(async () => {}),
    createFolder: vi.fn(async (_parent: string, _name: string) => ''),
  },
  writeFile: vi.fn(async () => {}),
  moveToTrash: vi.fn(async () => {}),
  collectFileContents: vi.fn(async () => []),
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
  vi.mocked(runtime.streamChat).mockReset()
  vi.mocked(fsBridge.fs.rename).mockClear()
  vi.mocked(fsBridge.fs.move).mockClear()
  vi.mocked(fsBridge.fs.createFolder).mockClear()
  vi.mocked(fsBridge.writeFile).mockClear()
  vi.mocked(fsBridge.moveToTrash).mockClear()
  vi.mocked(fsBridge.collectFileContents).mockClear()
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
    expect(fsBridge.moveToTrash).not.toHaveBeenCalled()
    expect(fsBridge.fs.rename).not.toHaveBeenCalled()
    expect(fsBridge.fs.move).not.toHaveBeenCalled()
    expect(fsBridge.writeFile).not.toHaveBeenCalled()
  })

  it('applyAction(trash) calls moveToTrash, marks applied, refreshes', async () => {
    vi.mocked(runtime.streamChat).mockReturnValue(streamTrash('/d/a') as never)
    const d = deps()
    const { result } = renderHook(() => useChat(d))
    await act(async () => {
      await result.current.send('go')
    })
    await act(async () => {
      await result.current.applyAction(1, 0)
    })
    expect(fsBridge.moveToTrash).toHaveBeenCalledWith('/d/a')
    expect(result.current.messages[1].actionsApplied?.[0]).toBe(true)
    expect(d.refresh).toHaveBeenCalled()
  })

  it('applyAction(rename) routes through applyPlan with the fs singleton', async () => {
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
    expect(fsBridge.fs.rename).toHaveBeenCalledWith('/d/a.txt', 'b.txt')
    expect(fsBridge.moveToTrash).not.toHaveBeenCalled()
  })

  it('applyAction(createFolder) calls fs.createFolder once per path segment', async () => {
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
    const cf = vi.mocked(fsBridge.fs.createFolder)
    expect(cf).toHaveBeenCalledTimes(2)
    expect(cf).toHaveBeenNthCalledWith(1, '/d', 'Organizzato')
    expect(cf).toHaveBeenNthCalledWith(2, '/d/Organizzato', '00 Inbox')
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
    expect(fsBridge.fs.createFolder).toHaveBeenCalledWith('/d', 'docs')
    expect(fsBridge.fs.move).toHaveBeenCalledWith('/d/a.txt', '/d/docs/a.txt')
  })

  it('applyAction(create) writes the file via fs.ts writeFile', async () => {
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
    expect(fsBridge.writeFile).toHaveBeenCalledWith('/d/note.md', 'hi')
  })

  it('applyAction records fs failures in actionErrors without marking applied', async () => {
    vi.mocked(runtime.streamChat).mockReturnValue(streamTrash('/d/a') as never)
    vi.mocked(fsBridge.moveToTrash).mockRejectedValueOnce(new Error('boom'))
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
    expect(fsBridge.moveToTrash).not.toHaveBeenCalled()
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

  it('applyAction ignores a double-click: fs runs once', async () => {
    vi.mocked(runtime.streamChat).mockReturnValue(streamTrash('/d/a') as never)
    const { result } = renderHook(() => useChat(deps()))
    await act(async () => {
      await result.current.send('go')
    })
    vi.mocked(fsBridge.moveToTrash).mockImplementationOnce(
      () => new Promise((r) => setTimeout(r, 10)),
    )
    await act(async () => {
      const p1 = result.current.applyAction(1, 0)
      const p2 = result.current.applyAction(1, 0)
      await Promise.all([p1, p2])
    })
    expect(fsBridge.moveToTrash).toHaveBeenCalledTimes(1)
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
    expect(fsBridge.writeFile).not.toHaveBeenCalled()
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
