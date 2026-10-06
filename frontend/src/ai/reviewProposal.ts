import { confirmAsk } from '../confirm.js'
import i18n from '../i18n'
import type { AiProposal } from './proposal.js'

/** Review the executable operations themselves; never ask the model to regenerate them. */
export function reviewProposal(proposal: AiProposal): Promise<boolean> {
  const lines = proposal.operations.map((op) => {
    const label = i18n.t(`chat.action.${op.kind === 'move' ? 'organize' : op.kind === 'createFile' ? 'create' : op.kind}`)
    if (op.kind === 'rename') return `${label}: ${op.path} → ${op.newName}`
    if (op.kind === 'move') return `${label}: ${op.path} → ${op.destDir}/${op.destName ?? op.path.split('/').pop()}`
    if (op.kind === 'createFile') return `${label}: ${op.path}\n${op.content}`
    return `${label}: ${op.path}`
  })
  return confirmAsk([...proposal.warnings, ...lines].join('\n'), {
    title: i18n.t('chat.workspace.reviewPlan'),
    danger: proposal.operations.some((op) => op.kind === 'trash'),
    acceptLabel: i18n.t('common.apply'),
  })
}
