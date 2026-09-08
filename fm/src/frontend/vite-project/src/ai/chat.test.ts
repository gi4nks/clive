import { describe, it, expect } from 'vitest'
import { extractActions, validateChatAction } from './chat.js'

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

describe('validateChatAction', () => {
  const ctx = { currentDir: '/home/u/dir', existingNames: ['other.txt'], guardOn: true }

  it('accepts a valid rename', () => {
    const r = validateChatAction({ type: 'rename', file: '/home/u/dir/a.txt', newName: 'b.txt' }, ctx)
    expect(r.ok).toBe(true)
  })

  it('rejects rename with invalid name', () => {
    const r = validateChatAction({ type: 'rename', file: '/home/u/dir/a.txt', newName: '../escape' }, ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/path|invalid/i)
  })

  it('rejects rename on protected path (guard on)', () => {
    const r = validateChatAction({ type: 'rename', file: '/Applications', newName: 'Bar' }, ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/system|protected/i)
  })

  it('allows protected path when guard is off', () => {
    const r = validateChatAction({ type: 'rename', file: '/Applications', newName: 'Bar' }, { ...ctx, guardOn: false })
    expect(r.ok).toBe(true)
  })

  it('rejects trash on protected path', () => {
    const r = validateChatAction({ type: 'trash', file: '/System' }, ctx)
    expect(r.ok).toBe(false)
  })

  it('rejects create outside current dir', () => {
    const r = validateChatAction({ type: 'create', file: '/etc/passwd', content: 'x' }, ctx)
    expect(r.ok).toBe(false)
  })

  it('accepts organize into a new subfolder', () => {
    const r = validateChatAction({ type: 'organize', file: '/home/u/dir/a.txt', dstFolder: 'docs' }, ctx)
    expect(r.ok).toBe(true)
  })
})
