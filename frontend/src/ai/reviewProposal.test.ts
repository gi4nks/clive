import { expect, it } from 'vitest'
import { reviewProposal } from './reviewProposal.js'
import { answerConfirm, askState } from '../confirm.js'
import { createProposal } from './proposal.js'

it('reviews the exact destination and waits for an explicit answer', async () => {
  const proposal = createProposal({ origin: 'chat', rootPath: '/Volumes/NAS', operations: [
    { id: 'm', kind: 'move', path: '/Volumes/NAS/a', destDir: '/Volumes/NAS/docs', destName: 'b' },
  ] })
  const result = reviewProposal(proposal)
  expect(askState().req?.message).toContain('/Volumes/NAS/a → /Volumes/NAS/docs/b')
  answerConfirm(false)
  expect(await result).toBe(false)
  const accepted = reviewProposal(proposal)
  answerConfirm(true)
  expect(await accepted).toBe(true)
})
