import { describe, expect, it, vi } from 'vitest'
import { linkedAbortController, describeAiError } from './execution.js'

describe('AI execution policy', () => {
  it('aborts on its own timeout and classifies it separately from user cancel', async () => {
    vi.useFakeTimers()
    const run = linkedAbortController(undefined, 100)
    vi.advanceTimersByTime(100)
    expect(run.signal.aborted).toBe(true)
    expect(run.error().code).toBe('timeout')
    run.finish()
    vi.useRealTimers()
  })

  it('propagates an external abort as aborted', () => {
    const ac = new AbortController()
    const run = linkedAbortController(ac.signal, 1000)
    ac.abort()
    expect(run.signal.aborted).toBe(true)
    expect(run.error().code).toBe('aborted')
    run.finish()
  })

  it('normalizes SDK errors without hiding useful provider detail', () => {
    expect(describeAiError(new Error('AI_APICallError: HTTP 502 upstream'))).toBe('HTTP 502 upstream')
    expect(describeAiError(null)).toBe('null')
  })
})
