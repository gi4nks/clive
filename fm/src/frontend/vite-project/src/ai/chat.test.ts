import { describe, it, expect } from 'vitest'
import { extractActions } from './chat.js'

describe('extractActions', () => {
  it('returns raw text when no actions block', () => {
    const r = extractActions('hello world')
    expect(r.text).toBe('hello world')
    expect(r.actions).toEqual([])
  })

  it('parses a valid actions block and strips it', () => {
    const raw = 'Sure, I can rename it.\n\n<<<ACTIONS>>>\n{"actions":[{"type":"rename","file":"/a/b.txt","newName":"c.txt"}]}\n<<<END>>>'
    const r = extractActions(raw)
    expect(r.text).toBe('Sure, I can rename it.')
    expect(r.actions).toEqual([{ type: 'rename', file: '/a/b.txt', newName: 'c.txt' }])
  })

  it('handles multiple actions', () => {
    const raw = `ok\n<<<ACTIONS>>>\n{"actions":[{"type":"rename","file":"/a","newName":"b"},{"type":"trash","file":"/c"}]}\n<<<END>>>`
    const r = extractActions(raw)
    expect(r.actions).toHaveLength(2)
    expect(r.actions[0].type).toBe('rename')
    expect(r.actions[1].type).toBe('trash')
  })

  it('leaves raw text intact when JSON is malformed', () => {
    const raw = 'Sure\n<<<ACTIONS>>>\n{"actions": [not valid]}\n<<<END>>>'
    const r = extractActions(raw)
    expect(r.actions).toEqual([])
    expect(r.text).toContain('<<<ACTIONS>>>')
  })

  it('drops unknown action types but keeps valid ones', () => {
    const raw = `x\n<<<ACTIONS>>>\n{"actions":[{"type":"rename","file":"/a","newName":"b"},{"type":"nuclear","code":"bad"}]}\n<<<END>>>`
    const r = extractActions(raw)
    expect(r.actions).toEqual([{ type: 'rename', file: '/a', newName: 'b' }])
  })

  it('is tolerant to whitespace and case in marker (upper)', () => {
    const raw = `msg\n<<<actions>>>\n{"actions":[{"type":"trash","file":"/x"}]}\n<<<end>>>`
    const r = extractActions(raw)
    expect(r.actions).toEqual([{ type: 'trash', file: '/x' }])
  })
})
