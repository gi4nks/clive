// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FileEntry } from '../api.js'

const mocks = vi.hoisted(() => ({
  checkHealth: vi.fn(),
  generatePlan: vi.fn(),
}))

vi.mock('./runtime.js', () => ({ checkHealth: mocks.checkHealth }))
vi.mock('./chat.js', () => ({ generatePlan: mocks.generatePlan }))

import { createPlanFromMessage, PLAN_MAX_ENTRIES } from './createPlanFromMessage.js'

const entry = (name: string, isDir = false): FileEntry => ({
  name,
  path: `/root/${name}`,
  isDir,
  size: 10,
  modified: 0,
  extension: name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : null,
})

describe('createPlanFromMessage', () => {
  beforeEach(() => {
    mocks.checkHealth.mockReset()
    mocks.generatePlan.mockReset()
  })

  it('runs health -> generatePlan -> expandPlan and returns a mounted Plan', async () => {
    const health = { ok: true, providers: {} }
    mocks.checkHealth.mockResolvedValue(health)
    mocks.generatePlan.mockResolvedValue({
      folders: ['01_Personal'],
      assignments: [{ file: 'cv.pdf', to: '01_Personal' }],
      renames: [],
      trash: [],
    })
    const entries = [entry('cv.pdf'), entry('notes.txt')]
    const plan = await createPlanFromMessage({
      text: 'analisi',
      entries,
      currentPath: '/root',
      guardOn: true,
      model: 'prov/model-x',
    })
    expect(plan.rootPath).toBe('/root')
    expect(plan.ops.map((o) => o.kind)).toEqual(['createFolder', 'move'])
    expect(mocks.generatePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'analisi',
        model: 'prov/model-x',
        health,
        listing: expect.stringContaining('cv.pdf'),
      }),
    )
  })

  it('throws provider-unreachable when health probe fails', async () => {
    mocks.checkHealth.mockResolvedValue({ ok: false, providers: {} })
    await expect(
      createPlanFromMessage({ text: 'x', entries: [], currentPath: '/root', guardOn: true, model: 'm' }),
    ).rejects.toThrow(/unreachable/i)
    expect(mocks.generatePlan).not.toHaveBeenCalled()
  })

  it('exports the 5000-entry hard cap (R7)', () => {
    expect(PLAN_MAX_ENTRIES).toBe(5000)
  })
})
