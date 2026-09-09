import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePlan } from './usePlan.js'
import type { ApplyReport } from '../api.js'
import type { Plan, PlanOp } from './plan.js'
import * as api from '../api.js'

vi.mock('../api.js', () => ({
  applyPlan: vi.fn(),
  undoPlan: vi.fn(),
  onPlanProgress: vi.fn(),
}))

const report = (batchId: string): ApplyReport => ({ applied: 1, skipped: 0, failed: [], batchId })

const makePlan = (ops: PlanOp[]): Plan => ({ rootPath: '/root', ops, unchanged: [], warnings: [] })

const cleanOp = (): PlanOp => ({ id: 'c1', kind: 'createFolder', path: '/root/X', included: true })
const issueOp = (): PlanOp => ({ id: 'm9', kind: 'move', path: '/root/f.txt', destDir: '/root/X', included: false, issue: 'target exists' })

let unsub: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks()
  unsub = vi.fn()
  vi.mocked(api.onPlanProgress).mockResolvedValue(unsub)
})

describe('usePlan', () => {
  it('setPlan moves to review and clears run state', () => {
    const { result } = renderHook(() => usePlan())
    act(() => result.current.setPlan(makePlan([cleanOp()])))
    expect(result.current.phase).toBe('review')
    expect(result.current.plan?.ops).toHaveLength(1)
    expect(result.current.report).toBeNull()
    expect(result.current.batchId).toBeNull()
  })

  it('toggleOp flips clean ops but never enables an issue op', () => {
    const { result } = renderHook(() => usePlan())
    act(() => result.current.setPlan(makePlan([cleanOp(), issueOp()])))
    const untouched = result.current.plan?.ops[1]
    act(() => result.current.toggleOp('c1'))
    expect(result.current.plan?.ops[0].included).toBe(false)
    act(() => result.current.toggleOp('c1'))
    expect(result.current.plan?.ops[0].included).toBe(true)
    // immutability: toggling c1 preserved the untouched op object by reference
    expect(result.current.plan?.ops[1]).toBe(untouched)
    act(() => result.current.toggleOp('m9'))
    expect(result.current.plan?.ops[1].included).toBe(false)
    act(() => result.current.toggleOp('m9'))
    expect(result.current.plan?.ops[1].included).toBe(false)
  })

  it('apply sends only included ops with a uuid batchId and lands on applied', async () => {
    vi.mocked(api.applyPlan).mockResolvedValue(report('any'))
    const { result } = renderHook(() => usePlan())
    act(() => result.current.setPlan(makePlan([cleanOp(), issueOp(), { id: 'off', kind: 'trash', path: '/root/g', included: false }])))
    await act(async () => { await result.current.apply() })
    expect(api.applyPlan).toHaveBeenCalledTimes(1)
    const [id, ops] = vi.mocked(api.applyPlan).mock.calls[0]
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(10)
    expect(ops).toHaveLength(1)
    expect(ops?.[0]?.id).toBe('c1')
    expect(result.current.batchId).toBe(id)
    expect(result.current.report?.applied).toBe(1)
    expect(result.current.phase).toBe('applied')
    expect(api.onPlanProgress).toHaveBeenCalledTimes(1)
    expect(unsub).toHaveBeenCalledTimes(1)
  })

  it('undo calls undoPlan with the same batchId and reaches undone', async () => {
    vi.mocked(api.applyPlan).mockResolvedValue(report('any'))
    vi.mocked(api.undoPlan).mockResolvedValue(report('any'))
    const { result } = renderHook(() => usePlan())
    act(() => result.current.setPlan(makePlan([cleanOp()])))
    await act(async () => { await result.current.apply() })
    const appliedId = result.current.batchId
    await act(async () => { await result.current.undo() })
    expect(api.undoPlan).toHaveBeenCalledWith(appliedId)
    expect(result.current.phase).toBe('undone')
    expect(result.current.undoReport).not.toBeNull()
  })

  it('apply failure surfaces error without losing plan; unsubscribe happens', async () => {
    vi.mocked(api.applyPlan).mockRejectedValue(new Error('invalid batchId'))
    const { result } = renderHook(() => usePlan())
    act(() => result.current.setPlan(makePlan([cleanOp()])))
    await act(async () => { await result.current.apply() })
    expect(result.current.phase).toBe('error')
    expect(result.current.error).toBe('invalid batchId')
    expect(result.current.plan?.ops).toHaveLength(1)
    expect(unsub).toHaveBeenCalledTimes(1)
  })

  it('updateOp edits createFolder path and recomputes local issues minimally', () => {
    const { result } = renderHook(() => usePlan())
    act(() => result.current.setPlan(makePlan([cleanOp(), issueOp()])))
    act(() => result.current.updateOp('c1', { path: '/root/Other' }))
    const c1 = result.current.plan?.ops[0]
    expect(c1?.kind === 'createFolder' && c1.path).toBe('/root/Other')
    expect(c1?.issue).toBeUndefined()
    expect(c1?.included).toBe(true)
    // empty path → issue set, op force-excluded
    act(() => result.current.updateOp('c1', { path: '  ' }))
    expect(result.current.plan?.ops[0]?.issue).toBe('empty path')
    expect(result.current.plan?.ops[0]?.included).toBe(false)
    // valid re-edit clears only the LOCAL issue and stays disabled
    act(() => result.current.updateOp('c1', { path: '/root/Ok' }))
    expect(result.current.plan?.ops[0]?.issue).toBeUndefined()
    expect(result.current.plan?.ops[0]?.included).toBe(false)
    // patching an op whose issue is authoritative (from expandPlan): edit is
    // rejected outright, issue and original values preserved (R12)
    act(() => result.current.updateOp('m9', { destDir: '/root/Y' }))
    expect(result.current.plan?.ops[1]?.issue).toBe('target exists')
    expect(result.current.plan?.ops[1]?.kind === 'move' && result.current.plan?.ops[1]?.destDir).toBe('/root/X')
  })

  it('close resets everything to idle', async () => {
    vi.mocked(api.applyPlan).mockResolvedValue(report('any'))
    const { result } = renderHook(() => usePlan())
    act(() => result.current.setPlan(makePlan([cleanOp()])))
    await act(async () => { await result.current.apply() })
    act(() => result.current.close())
    expect(result.current.phase).toBe('idle')
    expect(result.current.plan).toBeNull()
    expect(result.current.report).toBeNull()
    expect(result.current.batchId).toBeNull()
  })

  it('updateOp preserves a deep issue through a blank-then-valid edit', () => {
    const { result } = renderHook(() => usePlan())
    act(() => result.current.setPlan(makePlan([issueOp()])))
    // invalid edit must NOT launder 'target exists' into 'empty destination'
    act(() => result.current.updateOp('m9', { destDir: ' ' }))
    expect(result.current.plan?.ops[0]?.issue).toBe('target exists')
    expect(result.current.plan?.ops[0]?.included).toBe(false)
    // valid edit keeps the prior issue and stays excluded
    act(() => result.current.updateOp('m9', { destDir: '/root/Z' }))
    expect(result.current.plan?.ops[0]?.issue).toBe('target exists')
    expect(result.current.plan?.ops[0]?.included).toBe(false)
    // and toggle can never enable it afterwards
    act(() => result.current.toggleOp('m9'))
    expect(result.current.plan?.ops[0]?.included).toBe(false)
  })

  it('authoritative (expandPlan) issue survives edit-then-clear-then-toggle', () => {
    // The round-1 leak: 'invalid name' is produced by BOTH expandPlan and
    // updateOp — origin (not string) must decide. Op arrives with the issue.
    const op: PlanOp = { id: 'n1', kind: 'rename', path: '/root/a.txt', newName: 'b/c', included: false, issue: 'invalid name' }
    const { result } = renderHook(() => usePlan())
    act(() => result.current.setPlan(makePlan([op])))
    act(() => result.current.updateOp('n1', { newName: 'good.txt' }))
    expect(result.current.plan?.ops[0]?.issue).toBe('invalid name')
    expect(result.current.plan?.ops[0]?.kind === 'rename' && result.current.plan?.ops[0]?.newName).toBe('b/c')
    expect(result.current.plan?.ops[0]?.included).toBe(false)
    act(() => result.current.toggleOp('n1'))
    expect(result.current.plan?.ops[0]?.included).toBe(false)
  })

  it('local issue (from updateOp) is clearable and toggleable', () => {
    const { result } = renderHook(() => usePlan())
    act(() => result.current.setPlan(makePlan([cleanOp()])))
    // invalid edit → local issue, force-excluded
    act(() => result.current.updateOp('c1', { path: '  ' }))
    expect(result.current.plan?.ops[0]?.issue).toBe('empty path')
    expect(result.current.plan?.ops[0]?.included).toBe(false)
    // valid re-edit → local issue cleared (op stays disabled until toggled)
    act(() => result.current.updateOp('c1', { path: '/root/Ok' }))
    expect(result.current.plan?.ops[0]?.issue).toBeUndefined()
    expect(result.current.plan?.ops[0]?.included).toBe(false)
    // and it CAN be re-enabled — the lock isn't a blanket freeze
    act(() => result.current.toggleOp('c1'))
    expect(result.current.plan?.ops[0]?.included).toBe(true)
  })

  it('apply does not send ops that have an issue even if included', async () => {
    vi.mocked(api.applyPlan).mockResolvedValue(report('any'))
    const laundered: PlanOp = { id: 'x1', kind: 'trash', path: '/root/f', included: true, issue: 'target exists' }
    const { result } = renderHook(() => usePlan())
    act(() => result.current.setPlan(makePlan([cleanOp(), laundered])))
    await act(async () => { await result.current.apply() })
    const [, ops] = vi.mocked(api.applyPlan).mock.calls[0]
    expect(ops).toHaveLength(1)
    expect(ops?.[0]?.id).toBe('c1')
  })

  it('apply resets to error if progress subscription throws', async () => {
    vi.mocked(api.onPlanProgress).mockRejectedValue(new Error('listen boom'))
    const { result } = renderHook(() => usePlan())
    act(() => result.current.setPlan(makePlan([cleanOp()])))
    await act(async () => { await result.current.apply() })
    expect(result.current.phase).toBe('error')
    expect(result.current.error).toBe('listen boom')
    expect(api.applyPlan).not.toHaveBeenCalled()
  })

  it('folder-path edit escaping the plan root is rejected (review I-2)', () => {
    const { result } = renderHook(() => usePlan())
    act(() => result.current.setPlan(makePlan([cleanOp()])))
    act(() => result.current.updateOp('c1', { path: '/root/../escape' }))
    expect(result.current.plan?.ops[0]?.issue).toBe('invalid folder path')
    expect(result.current.plan?.ops[0]?.included).toBe(false)
    act(() => result.current.updateOp('c1', { path: '/etc' }))
    expect(result.current.plan?.ops[0]?.issue).toBe('invalid folder path')
    act(() => result.current.updateOp('c1', { path: '/root/a//b' }))
    expect(result.current.plan?.ops[0]?.issue).toBe('invalid folder path')
    // a valid in-root edit clears the LOCAL issue and the op is re-togglable
    act(() => result.current.updateOp('c1', { path: '/root/Fine' }))
    expect(result.current.plan?.ops[0]?.issue).toBeUndefined()
    act(() => result.current.toggleOp('c1'))
    expect(result.current.plan?.ops[0]?.included).toBe(true)
  })

  it('rename edit with a backslash is rejected like the Rust engine does (I-2)', () => {
    const op: PlanOp = { id: 'r1', kind: 'rename', path: '/root/a.txt', newName: 'a', included: true }
    const { result } = renderHook(() => usePlan())
    act(() => result.current.setPlan(makePlan([op])))
    act(() => result.current.updateOp('r1', { newName: 'bad\\name' }))
    expect(result.current.plan?.ops[0]?.issue).toBe('invalid name')
    expect(result.current.plan?.ops[0]?.included).toBe(false)
    act(() => result.current.updateOp('r1', { newName: 'good.txt' }))
    expect(result.current.plan?.ops[0]?.issue).toBeUndefined()
  })
})
