import { describe, expect, it } from 'vitest'
import { proposalFromChatActions, proposalFromPlan, reviewFor } from './proposal.js'
import type { Plan } from './plan.js'

const context = {
  currentDir: '/Users/test/Desktop',
  entries: [
    { name: 'report.txt', path: '/Users/test/Desktop/report.txt' },
    { name: 'photo.jpg', path: '/Users/test/Desktop/photo.jpg' },
  ],
  guardOn: false,
}

describe('proposalFromChatActions', () => {
  it('converts a rename into an inline proposal', () => {
    const result = proposalFromChatActions([
      { type: 'rename', file: '/Users/test/Desktop/report.txt', newName: 'annual-report.txt' },
    ], context)

    expect(result.invalidActions).toEqual([])
    expect(result.proposal.review).toBe('inline')
    expect(result.proposal.risk).toBe('low')
    expect(result.proposal.requiresExplicitConfirmation).toBe(false)
    expect(result.proposal.operations).toEqual([
      {
        id: 'chat:0:rename',
        kind: 'rename',
        path: '/Users/test/Desktop/report.txt',
        newName: 'annual-report.txt',
      },
    ])
  })

  it('normalizes organize into folder creation and move operations', () => {
    const result = proposalFromChatActions([
      { type: 'organize', file: '/Users/test/Desktop/report.txt', dstFolder: '01 Projects' },
    ], context)

    expect(result.proposal.review).toBe('compact')
    expect(result.proposal.risk).toBe('medium')
    expect(result.proposal.operations).toEqual([
      { id: 'chat:0:folder', kind: 'createFolder', path: '/Users/test/Desktop/01 Projects' },
      { id: 'chat:0:move', kind: 'move', path: '/Users/test/Desktop/report.txt', destDir: '/Users/test/Desktop/01 Projects' },
    ])
  })

  it('always sends trash to explicit plan review', () => {
    const result = proposalFromChatActions([
      { type: 'trash', file: '/Users/test/Desktop/report.txt' },
    ], context)

    expect(result.proposal.review).toBe('plan')
    expect(result.proposal.risk).toBe('high')
    expect(result.proposal.requiresExplicitConfirmation).toBe(true)
  })

  it('keeps invalid actions as warnings and never makes them executable', () => {
    const result = proposalFromChatActions([
      { type: 'rename', file: '/Users/test/Desktop/report.txt', newName: 'photo.jpg' },
      { type: 'createFolder', folder: '../outside' },
    ], context)

    expect(result.invalidActions).toHaveLength(2)
    expect(result.proposal.operations).toEqual([])
    expect(result.proposal.review).toBe('plan')
    expect(result.proposal.requiresExplicitConfirmation).toBe(true)
    expect(result.proposal.warnings).toHaveLength(2)
  })
})

describe('reviewFor', () => {
  it('uses compact review for several safe operations', () => {
    expect(reviewFor([
      { id: '1', kind: 'rename', path: '/a', newName: 'b' },
      { id: '2', kind: 'rename', path: '/c', newName: 'd' },
    ])).toBe('compact')
  })

  it('uses plan review for large operation sets', () => {
    const operations = Array.from({ length: 8 }, (_, index) => ({
      id: String(index),
      kind: 'rename' as const,
      path: `/file-${index}`,
      newName: `renamed-${index}`,
    }))
    expect(reviewFor(operations)).toBe('plan')
  })

  it('forces network moves into plan review', () => {
    const proposal = proposalFromChatActions([
      { type: 'organize', file: '/Volumes/NAS/report.txt', dstFolder: 'Docs' },
    ], {
      ...context,
      currentDir: '/Volumes/NAS',
      entries: [{ name: 'report.txt', path: '/Volumes/NAS/report.txt' }],
      location: { kind: 'network', path: '/Volumes/NAS', mountPoint: '/Volumes/NAS', volumeName: 'NAS', online: true },
    }).proposal

    expect(proposal.review).toBe('plan')
    expect(proposal.requiresExplicitConfirmation).toBe(true)
    expect(proposal.location?.kind).toBe('network')
  })
})

describe('proposalFromPlan', () => {
  it('keeps the Plan adapter semantics while excluding disabled and invalid ops', () => {
    const plan: Plan = {
      rootPath: '/d',
      ops: [
        { id: 'move-1', kind: 'move', path: '/d/a.txt', destDir: '/d/docs', included: true },
        { id: 'trash-1', kind: 'trash', path: '/d/old.txt', included: false },
        { id: 'bad-1', kind: 'rename', path: '/d/x', newName: 'y', included: true, issue: 'protected' },
      ],
      unchanged: [],
      warnings: ['one model warning'],
    }
    const proposal = proposalFromPlan(plan)

    expect(proposal.origin).toBe('plan')
    expect(proposal.review).toBe('plan')
    expect(proposal.risk).toBe('medium')
    expect(proposal.operations).toEqual([
      { id: 'move-1', kind: 'move', path: '/d/a.txt', destDir: '/d/docs' },
    ])
    expect(proposal.warnings).toEqual(['one model warning', 'bad-1: protected'])
    expect(proposal.requiresExplicitConfirmation).toBe(true)
  })
})
