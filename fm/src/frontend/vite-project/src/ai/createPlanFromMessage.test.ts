import { describe, it, expect, vi } from 'vitest'
import { createPlanFromMessage } from './createPlanFromMessage.js'
import type { ModelPlanShape } from './plan.js'
import type { FileEntry } from '../api.js'

const entry = (name: string): FileEntry =>
  ({ name, path: `/root/${name}`, isDir: false, size: 5, modified: 0, extension: null }) as unknown as FileEntry

const EMPTY: ModelPlanShape = { folders: [], rules: [], renames: [], trashPatterns: [] }
const FILLED: ModelPlanShape = {
  folders: ['Docs'],
  rules: [{ match: '.txt', to: 'Docs' }],
  renames: [],
  trashPatterns: [],
}

const ctx = { text: 'organizza', entries: [entry('a.txt')], currentPath: '/root', guardOn: true, model: 'x/y', health: { ok: true, providers: {} } }

describe('createPlanFromMessage', () => {
  it('returns the plan when the first turn already produces ops (single call)', async () => {
    const generate = vi.fn(async () => FILLED) as never
    const p = await createPlanFromMessage({ ...ctx, generate })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(p.ops.length).toBeGreaterThan(0)
  })

  it('retries ONCE when the first plan is empty and returns the recovered one', async () => {
    const generate = vi
      .fn(async (args: { retry?: boolean }) => (args.retry ? FILLED : EMPTY)) as never
    const p = await createPlanFromMessage({ ...ctx, generate })
    expect(generate).toHaveBeenCalledTimes(2)
    expect((generate as any).mock.calls[1][0].retry).toBe(true)
    expect(p.ops.length).toBeGreaterThan(0)
  })

  it('still returns an empty plan when both attempts fail (caller surfaces it)', async () => {
    const generate = vi.fn(async () => EMPTY) as never
    const p = await createPlanFromMessage({ ...ctx, generate })
    expect(generate).toHaveBeenCalledTimes(2)
    expect(p.ops.length).toBe(0)
  })
})