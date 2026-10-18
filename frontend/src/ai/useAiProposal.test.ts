import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { applyPlan, undoPlan } from '../api.js'
import { applyProposal, useAiProposal } from './useAiProposal.js'
import type { AiProposal } from './proposal.js'
import { snapshotContext } from './context.js'

vi.mock('../api.js', () => ({
  applyPlan: vi.fn(),
  undoPlan: vi.fn(),
  listVolumes: vi.fn(async () => []),
}))
vi.mock('./reviewProposal.js', () => ({ reviewProposal: vi.fn(async () => true) }))

const proposal = (operations: AiProposal['operations']): AiProposal => ({
  id: 'test:proposal', origin: 'chat', rootPath: '/d', risk: 'medium', review: 'compact',
  operations, warnings: [], requiresExplicitConfirmation: false,
})

beforeEach(() => {
  vi.mocked(applyPlan).mockReset()
  vi.mocked(undoPlan).mockReset()
  vi.mocked(applyPlan).mockResolvedValue({ applied: 1, skipped: 0, failed: [], batchId: 'batch-1' })
  vi.mocked(undoPlan).mockResolvedValue({ applied: 1, skipped: 0, failed: [], batchId: 'batch-1' })
})

describe('applyProposal', () => {
  it('normalizes every semantic operation into one durable Rust batch', async () => {
    const operations: AiProposal['operations'] = [
      { id: 'f', kind: 'createFolder', path: '/d/docs' },
      { id: 'r', kind: 'rename', path: '/d/a.txt', newName: 'b.txt' },
      { id: 'm', kind: 'move', path: '/d/b.txt', destDir: '/d/docs', destName: 'renamed.txt' },
      { id: 'c', kind: 'createFile', path: '/d/docs/note.md', content: 'hello' },
      { id: 't', kind: 'trash', path: '/d/old.md' },
    ]
    const result = await applyProposal({}, proposal(operations))

    expect(applyPlan).toHaveBeenCalledTimes(1)
    const [batchId, ops] = vi.mocked(applyPlan).mock.calls[0]
    expect(batchId.length).toBeGreaterThan(10)
    expect(ops).toEqual([
      { id: 'f:parent:0', kind: 'createFolder', path: '/d/docs', included: true },
      { id: 'r', kind: 'rename', path: '/d/a.txt', newName: 'b.txt', included: true },
      { id: 'm', kind: 'move', path: '/d/b.txt', destDir: '/d/docs', destName: 'renamed.txt', included: true },
      { id: 'c', kind: 'createFile', path: '/d/docs/note.md', content: 'hello', included: true },
      { id: 't', kind: 'trash', path: '/d/old.md', included: true },
    ])
    expect(result).toMatchObject({ applied: 1, failures: [], batchId: 'batch-1' })
  })

  it('maps Rust operation failures to proposal failures', async () => {
    vi.mocked(applyPlan).mockResolvedValue({
      applied: 1, skipped: 0, batchId: 'batch-2',
      failed: [{ id: 'trash-1', code: 'filesystem', error: 'permission denied' }],
    })
    const result = await applyProposal({}, proposal([
      { id: 'trash-1', kind: 'trash', path: '/d/old.md' },
    ]))
    expect(result.failures).toEqual([{ op: 'trash-1', error: 'permission denied' }])
  })

  it('refuses to apply a proposal against a changed context', async () => {
    const result = await applyProposal({
      getContext: () => ({ rootPath: '/d', entries: [{ name: 'new.txt', path: '/d/new.txt' }], guardOn: false }),
      contextChangedMessage: 'context changed',
    }, {
      ...proposal([{ id: 'r', kind: 'rename', path: '/d/a.txt', newName: 'b.txt' }]),
      context: snapshotContext({ rootPath: '/d', entries: [{ name: 'a.txt', path: '/d/a.txt' }], guardOn: false }),
    })

    expect(result.failures).toEqual([{ op: 'test:proposal', error: 'context changed' }])
    expect(applyPlan).not.toHaveBeenCalled()
  })
})

describe('useAiProposal', () => {
  it('undoes through the same Rust batch id and preserves partial failures for retry', async () => {
    const { result } = renderHook(() => useAiProposal({}))
    await act(async () => { await result.current.apply(proposal([{ id: 'r', kind: 'rename', path: '/d/a', newName: 'b' }])) })
    expect(result.current.result?.batchId).toBe('batch-1')

    vi.mocked(undoPlan).mockResolvedValueOnce({
      applied: 0, skipped: 0, batchId: 'batch-1',
      failed: [{ id: 'r', code: 'filesystem', error: 'target exists' }],
    })
    await act(async () => { await result.current.undo() })
    expect(undoPlan).toHaveBeenCalledWith('batch-1')
    expect(result.current.phase).toBe('failed')
    expect(result.current.result?.batchId).toBe('batch-1')
  })
})
