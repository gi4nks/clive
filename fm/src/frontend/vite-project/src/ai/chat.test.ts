import { describe, it, expect } from 'vitest'
import { extractActions, validateChatAction, trimHistory, buildChatPrompt, generatePlan, CHAT_SYSTEM_PROMPT, type ChatMessage } from './chat.js'
import { renderDirListing } from './budget.js'

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

  it('rejects create when the target file already exists', () => {
    const r = validateChatAction({ type: 'create', file: '/home/u/dir/notes.md', content: 'x' }, { ...ctx, existingNames: ['notes.md'] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/already exists/i)
  })

  it('accepts a nested createFolder', () => {
    const r = validateChatAction({ type: 'createFolder', folder: 'Organizzato/00 Inbox' }, ctx)
    expect(r.ok).toBe(true)
  })

  it('rejects createFolder with .. traversal', () => {
    const r = validateChatAction({ type: 'createFolder', folder: 'a/../../b' }, ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/traversal|invalid/i)
  })

  it('rejects createFolder colliding with an existing top-level name', () => {
    const r = validateChatAction({ type: 'createFolder', folder: 'other.txt/sub' }, { ...ctx, existingNames: ['other.txt'] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/exists/i)
  })

  it('marks createFolder protected when guard on', () => {
    const r = validateChatAction({ type: 'createFolder', folder: 'Applications' }, { ...ctx, currentDir: '/', existingNames: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/system|protected/i)
  })
})

describe('trimHistory', () => {
  const mk = (n: number): ChatMessage[] => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}_${'x'.repeat(100)}` }))

  it('returns all if under budget', () => {
    const { kept, truncated } = trimHistory(mk(3), 10_000)
    expect(kept).toHaveLength(3)
    expect(truncated).toBe(false)
  })

  it('preserves first user message when trimming', () => {
    const { kept, truncated } = trimHistory(mk(20), 500)
    expect(truncated).toBe(true)
    expect(kept[0].role).toBe('user')
    expect(kept[0].content).toMatch(/^m0_/)
  })

  it('drops middle turns, keeps recent', () => {
    const { kept } = trimHistory(mk(20), 1000)
    expect(kept[kept.length - 1].content).toMatch(/^m19_/)
  })
})

describe('buildChatPrompt', () => {
  it('includes system prompt with ACTIONS marker instructions', () => {
    const { system } = buildChatPrompt({ currentDir: '/d', dirListing: 'a.txt\nb.txt', fileContext: '' }, [], 'hi')
    expect(system).toContain(CHAT_SYSTEM_PROMPT.slice(0, 20))
    expect(system).toContain('ACTIONS')
  })

  it('prompt includes dir listing', () => {
    const { prompt } = buildChatPrompt({ currentDir: '/d', dirListing: 'secret.txt', fileContext: '' }, [], 'hi')
    expect(prompt).toContain('secret.txt')
  })

  it('prompt includes history', () => {
    const { prompt, truncated } = buildChatPrompt({ currentDir: '/d', dirListing: '', fileContext: '' }, [{ role: 'user', content: 'prev' }], 'next')
    expect(prompt).toContain('prev')
    expect(prompt).toContain('next')
    expect(truncated).toBe(false)
  })
})

describe('renderDirListing', () => {
  it('lists file names and marks folders', () => {
    const s = renderDirListing([
      { name: 'a.txt', path: '/d/a.txt', size: 10, modified: 0, isDir: false },
      { name: 'sub', path: '/d/sub', size: 0, modified: 0, isDir: true },
    ] as never)
    expect(s).toContain('a.txt')
    expect(s).toMatch(/sub\s*\/?/)
  })

  it('truncates long listings with ellipsis', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ name: `f${i}`, path: `/d/f${i}`, size: 1, modified: 0, isDir: false }))
    const s = renderDirListing(many as never, 100)
    expect(s.split('\n').length).toBeLessThanOrEqual(102)
    expect(s).toMatch(/\+ \d+ more|\.\.\./)
  })
})

describe('generatePlan', () => {
  it('generatePlan requests json_object and returns parsed shape', async () => {
    const fake = async (a: any) => {
      expect(a.prompt).toMatch(/json/i)
      expect(a.prompt).toContain('cv.pdf')
      expect(a.prompt).toContain('CV')
      expect(a.system).toMatch(/json/i)
      return { folders: ['CV'], rules: [{ match: 'cv', to: 'CV' }], renames: [], trashPatterns: [] }
    }
    const out = await generatePlan({ text: 'put cv.pdf into CV', listing: 'cv.pdf', model: 'x/y', health: { ok: true, providers: {} }, callModel: fake })
    expect(out.folders).toEqual(['CV'])
  })

  it('normalizes missing fields to empty arrays (no throw)', async () => {
    const fake = async () => ({})
    const out = await generatePlan({ text: 't', listing: 'l', model: 'x/y', health: { ok: true, providers: {} }, callModel: fake })
    expect(out).toEqual({ folders: [], rules: [], renames: [], trashPatterns: [], fallback: undefined, notes: undefined })
  })

  it('uses the stricter system prompt on retry', async () => {
    let systems: string[] = []
    const fake = async (a: any) => {
      systems.push(a.system)
      return { folders: [], rules: [], renames: [], trashPatterns: [] }
    }
    const base = { text: 't', listing: 'l', model: 'x/y', health: { ok: true, providers: {} } }
    await generatePlan({ ...base, callModel: fake })
    await generatePlan({ ...base, retry: true, callModel: fake })
    expect(systems).toHaveLength(2)
    expect(systems[0]).not.toBe(systems[1])
    expect(systems[1]).toMatch(/EMPTY plan/i)
  })

  it('throws when no provider is reachable', async () => {
    const fake = async () => { throw new Error('must not be called') }
    await expect(
      generatePlan({ text: 't', listing: 'l', model: 'x/y', health: { ok: false, providers: {} }, callModel: fake }),
    ).rejects.toThrow()
  })
})
