import { describe, it, expect, vi } from 'vitest'
import { proposeRenames, summarize, aiUnavailable, type ActionDeps } from './actions'
import type { FileContent } from './budget'
import type { AiHealth } from './runtime'

const okHealth: AiHealth = { ok: true, providers: { ollama: true } }
const file = (path: string, text: string | null): FileContent => ({
  path,
  name: path.split('/').pop()!,
  isDir: false,
  size: text ? text.length : 0,
  text,
})

function deps(impl: ReturnType<typeof vi.fn>): ActionDeps {
  return {
    model: 'llama3.2',
    health: okHealth,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callModel: impl as any,
  }
}

describe('aiUnavailable', () => {
  it('reports unavailability when health is down', () => {
    expect(aiUnavailable({ ok: false, providers: {} })).toMatch(/unreachable/i)
    expect(aiUnavailable(okHealth)).toBeNull()
  })
})

describe('proposeRenames', () => {
  it('validates and returns a plan, applying safety rules', async () => {
    const call = vi.fn(async () => ({
      renames: [
        { path: '/d/IMG_1234.jpg', newName: 'vacanze.jpg' },
        { path: '/d/a.txt', newName: 'a/bad' }, // invalid separator
      ],
    }))
    const plan = await proposeRenames(
      [file('/d/IMG_1234.jpg', 'image bytes'), file('/d/a.txt', 'x')],
      ['vacanze.jpg', 'a.txt'], // target collides with disk
      deps(call),
    )
    expect(call).toHaveBeenCalled()
    const ok = plan.find((p) => p.path === '/d/IMG_1234.jpg')!
    // collision with an existing name is auto-resolved to a unique, applicable one
    expect(ok.resolved.ok).toBe(true)
    expect(ok.resolved.to).toBe('vacanze copy 1.jpg')
    const bad = plan.find((p) => p.path === '/d/a.txt')!
    expect(bad.resolved.ok).toBe(false)
    expect(bad.resolved.error).toMatch(/path/i)
  })

  it('throws when AI is unavailable', async () => {
    await expect(
      proposeRenames([], [], { model: 'm', health: { ok: false, providers: {} } }),
    ).rejects.toThrow()
  })
})

describe('summarize', () => {
  it('returns the model summary text', async () => {
    const call = vi.fn(async () => ({ summary: 'Un PDF di fatture.' }))
    const s = await summarize([file('/d/f.pdf', 'testo')], deps(call))
    expect(s).toBe('Un PDF di fatture.')
  })
})
