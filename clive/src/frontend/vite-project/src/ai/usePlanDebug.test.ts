import { describe, it, expect, beforeEach } from 'vitest'
import { addDebugEvent, addDebugLog, updateDebugLog, clearDebugLogs, getDebugLogs } from './usePlanDebug'

describe('usePlanDebug', () => {
  beforeEach(() => {
    clearDebugLogs()
  })

  it('adds and retrieves logs in order', () => {
    const entry = addDebugLog({
      id: 'test-1',
      model: 'gpt-4',
      status: 'pending',
      promptText: 'organize files',
      signature: '60 files',
    })

    expect(entry.id).toBe('test-1')
    const logs = getDebugLogs()
    expect(logs.length).toBe(1)
    expect(logs[0].status).toBe('pending')
  })

  it('updates an existing log', () => {
    addDebugLog({
      id: 'test-2',
      model: 'gpt-4',
      status: 'pending',
      promptText: 'organize',
      signature: 'signature',
    })

    updateDebugLog('test-2', { status: 'success', expandedOpsCount: 5 })
    const logs = getDebugLogs()
    expect(logs[0].status).toBe('success')
    expect(logs[0].expandedOpsCount).toBe(5)
  })

  it('clears logs', () => {
    addDebugLog({
      id: 'test-3',
      model: 'gpt-4',
      status: 'pending',
      promptText: 'text',
      signature: 'sig',
    })
    expect(getDebugLogs().length).toBe(1)
    clearDebugLogs()
    expect(getDebugLogs().length).toBe(0)
  })

  it('redacts account paths and records bounded trace events', () => {
    addDebugLog({
      id: 'safe-1', model: 'test', status: 'pending',
      promptText: 'read /Users/demo/Private/api_key=secret', signature: 'sig',
    })
    addDebugEvent('safe-1', { stage: 'stream', type: 'error', detail: '/Users/demo/Private failed' })
    const log = getDebugLogs()[0]
    expect(log.promptText).toContain('~/Private')
    expect(log.promptText).toContain('api_key=[redacted]')
    expect(log.events?.[0]?.detail).toContain('~/Private')
    expect(log.events?.[0]?.detail).not.toContain('/Users/demo')
  })
})
