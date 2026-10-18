// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { DEFAULT_CONFIG, setAppConfig } from '../settings/appConfig'
import type { Plan } from './plan'

const { createPlanFromMessage } = vi.hoisted(() => ({ createPlanFromMessage: vi.fn() }))
vi.mock('./createPlanFromMessage', () => ({ PLAN_MAX_ENTRIES: 5000, createPlanFromMessage }))

import { usePlanGeneration } from './usePlanGeneration'

const emptyPlan = { ops: [], warnings: [] } as unknown as Plan
const readyPlan = { ops: [{ kind: 'rename', from: '/a', to: '/b' }], warnings: [], debugId: 'debug-plan' } as unknown as Plan
const args = () => ({ entries: [], currentPath: '/home/user', guardOn: true, model: 'provider/model', setPlan: vi.fn() })

describe('usePlanGeneration', () => {
  beforeEach(() => {
    setAppConfig({ ...DEFAULT_CONFIG, ai: { ...DEFAULT_CONFIG.ai, enabled: true } })
    createPlanFromMessage.mockReset()
  })
  afterEach(cleanup)

  it('creates and publishes a non-empty plan, then exposes elapsed state as idle', async () => {
    createPlanFromMessage.mockResolvedValue(readyPlan)
    const input = args()
    const { result } = renderHook(() => usePlanGeneration(input))
    await act(async () => { await result.current.start('rename this') })
    expect(createPlanFromMessage).toHaveBeenCalledWith(expect.objectContaining({
      text: 'rename this', entries: input.entries, currentPath: input.currentPath, guardOn: true, model: 'provider/model',
    }))
    expect(input.setPlan).toHaveBeenCalledWith(readyPlan)
    expect(result.current.busy).toBe(false)
    expect(result.current.notice).toBeNull()
    expect(result.current.elapsed).toBe(0)
  })

  it('reports empty output and can dismiss that notice', async () => {
    createPlanFromMessage.mockResolvedValue(emptyPlan)
    const { result } = renderHook(() => usePlanGeneration(args()))
    await act(async () => { await result.current.start('make a plan') })
    expect(result.current.notice).toEqual({ kind: 'empty', message: expect.any(String) })
    act(() => result.current.dismissNotice())
    expect(result.current.notice).toBeNull()
  })

  it('converts failures into persistent error notices', async () => {
    createPlanFromMessage.mockRejectedValue(new Error('provider unavailable'))
    const { result } = renderHook(() => usePlanGeneration(args()))
    await act(async () => { await result.current.start('make a plan') })
    expect(result.current.notice?.kind).toBe('error')
    expect(result.current.notice?.message).toContain('provider unavailable')
  })

  it('does not start while disabled by the caller or application settings', async () => {
    const input = args()
    const { result, rerender } = renderHook(({ enabled }) => usePlanGeneration({ ...input, enabled }), { initialProps: { enabled: false } })
    expect(result.current.canPlan).toBe(false)
    await act(async () => { await result.current.start('ignored') })
    expect(createPlanFromMessage).not.toHaveBeenCalled()
    rerender({ enabled: true })
    setAppConfig({ ...DEFAULT_CONFIG, ai: { ...DEFAULT_CONFIG.ai, enabled: false } })
    await act(async () => { await result.current.start('ignored') })
    expect(createPlanFromMessage).not.toHaveBeenCalled()
  })

  it('aborts active generation when disabled and suppresses plans above the entry limit', async () => {
    let signal: AbortSignal | undefined
    createPlanFromMessage.mockImplementation(({ signal: s }: { signal: AbortSignal }) => {
      signal = s
      return new Promise(() => {})
    })
    const input = args()
    const { result, rerender } = renderHook(({ enabled }) => usePlanGeneration({ ...input, enabled }), { initialProps: { enabled: true } })
    act(() => { void result.current.start('slow') })
    await waitFor(() => expect(result.current.busy).toBe(true))
    rerender({ enabled: false })
    await waitFor(() => expect(signal?.aborted).toBe(true))
    expect(result.current.canPlan).toBe(false)
    const tooMany = { ...args(), entries: Array.from({ length: 5001 }, (_, i) => ({ path: `/${i}` } as never)) }
    const overLimit = renderHook(() => usePlanGeneration(tooMany))
    expect(overLimit.result.current.canPlan).toBe(false)
    await act(async () => { await overLimit.result.current.start('ignored') })
    expect(createPlanFromMessage).toHaveBeenCalledTimes(1)
  })
})
