import { describe, expect, it, vi } from 'vitest'
import { applyProposal } from './useAiProposal.js'
import type { AiProposal } from './proposal.js'
import type { Fs } from './apply.js'
import { snapshotContext } from './context.js'

const proposal = (operations: AiProposal['operations']): AiProposal => ({
  id: 'test:proposal',
  origin: 'chat',
  rootPath: '/d',
  risk: 'medium',
  review: 'compact',
  operations,
  warnings: [],
  requiresExplicitConfirmation: false,
})

function io() {
  const fs: Fs = {
    exists: vi.fn(async () => true),
    rename: vi.fn(async () => {}),
    move: vi.fn(async () => {}),
    createFolder: vi.fn(async (_parent, name) => name),
  }
  return {
    fs,
    writeFile: vi.fn(async () => {}),
    moveToTrash: vi.fn(async () => {}),
  }
}

describe('applyProposal', () => {
  it('normalizes semantic operations into the existing apply adapter', async () => {
    const deps = io()
    const result = await applyProposal(deps, proposal([
      { id: 'f', kind: 'createFolder', path: '/d/one/two' },
      { id: 'r', kind: 'rename', path: '/d/a.txt', newName: 'b.txt' },
      { id: 'm', kind: 'move', path: '/d/b.txt', destDir: '/d/one' },
    ]))

    expect(deps.fs.createFolder).toHaveBeenNthCalledWith(1, '/d', 'one')
    expect(deps.fs.createFolder).toHaveBeenNthCalledWith(2, '/d/one', 'two')
    expect(deps.fs.rename).toHaveBeenCalledWith('/d/a.txt', 'b.txt')
    expect(deps.fs.move).toHaveBeenCalledWith('/d/b.txt', '/d/one/b.txt')
    expect(result.failures).toEqual([])
    expect(result.applied).toBe(4)
  })

  it('executes generated files and trash through direct adapters', async () => {
    const deps = io()
    const result = await applyProposal(deps, proposal([
      { id: 'c', kind: 'createFile', path: '/d/note.md', content: 'hello' },
      { id: 't', kind: 'trash', path: '/d/old.md' },
    ]))

    expect(deps.writeFile).toHaveBeenCalledWith('/d/note.md', 'hello')
    expect(deps.moveToTrash).toHaveBeenCalledWith('/d/old.md')
    expect(result.directApplied).toBe(2)
    expect(result.applied).toBe(2)
  })

  it('reports direct operation failures without hiding successful operations', async () => {
    const deps = io()
    deps.moveToTrash.mockRejectedValueOnce(new Error('permission denied'))
    const result = await applyProposal(deps, proposal([
      { id: 'c', kind: 'createFile', path: '/d/note.md', content: 'hello' },
      { id: 't', kind: 'trash', path: '/d/old.md' },
    ]))

    expect(result.applied).toBe(1)
    expect(result.failures[0]?.error).toContain('permission denied')
  })

  it('refuses to apply a proposal against a changed context', async () => {
    const deps = io()
    const result = await applyProposal({
      ...deps,
      getContext: () => ({ rootPath: '/d', entries: [{ name: 'new.txt', path: '/d/new.txt' }], guardOn: false }),
      contextChangedMessage: 'context changed',
    }, {
      ...proposal([{ id: 'r', kind: 'rename', path: '/d/a.txt', newName: 'b.txt' }]),
      context: snapshotContext({ rootPath: '/d', entries: [{ name: 'a.txt', path: '/d/a.txt' }], guardOn: false }),
    })

    expect(result.failures).toEqual([{ op: 'test:proposal', error: 'context changed' }])
    expect(deps.fs.rename).not.toHaveBeenCalled()
  })
})
