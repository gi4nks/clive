// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { writeLastBatch, readLastBatch, clearLastBatch } from './planJournalStore.js'

const KEY = 'clive.plan.lastBatch'

describe('planJournalStore (R11 restart-undo persistence)', () => {
  beforeEach(() => localStorage.clear())

  it('roundtrips a written batch id', () => {
    writeLastBatch({ batchId: 'b1', rootPath: '/root', createdAt: 123 })
    expect(readLastBatch()).toBe('b1')
  })

  it('returns null when nothing is stored', () => {
    expect(readLastBatch()).toBeNull()
  })

  it('clear removes the key', () => {
    writeLastBatch({ batchId: 'b2', rootPath: null, createdAt: 0 })
    clearLastBatch()
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(readLastBatch()).toBeNull()
  })

  it('malformed JSON is cleared on read, not thrown', () => {
    localStorage.setItem(KEY, '{nope')
    expect(readLastBatch()).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('payload without a string batchId is cleared on read', () => {
    localStorage.setItem(KEY, JSON.stringify({ rootPath: '/x', createdAt: 1 }))
    expect(readLastBatch()).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})
