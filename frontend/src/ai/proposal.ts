/**
 * Shared semantic seam for AI mutations.
 *
 * This module deliberately has no React, Tauri, or filesystem side effects.
 * Chat actions, quick-action previews, and PlanOps can be converted here and
 * then rendered by the appropriate review adapter.
 */
import type { FileEntry } from '../api.js'
import type { Plan } from './plan.js'
import { snapshotContext, type AiContextSnapshot } from './context.js'
import type { LocationDescriptor } from '../location.js'
import {
  validateChatAction,
  type ChatAction,
  type ValidateCtx,
} from './chat.js'

export type ProposalOrigin = 'chat' | 'quick-action' | 'context-menu' | 'plan'
export type ProposalRisk = 'low' | 'medium' | 'high'
export type ProposalReview = 'inline' | 'compact' | 'plan'

export type ProposalOperation =
  | { id: string; kind: 'rename'; path: string; newName: string }
  | { id: string; kind: 'createFolder'; path: string }
  | { id: string; kind: 'move'; path: string; destDir: string; destName?: string }
  | { id: string; kind: 'createFile'; path: string; content: string }
  | { id: string; kind: 'trash'; path: string }

export interface ProposalContext {
  currentDir: string
  entries: Pick<FileEntry, 'name' | 'path'>[]
  selectedPaths?: string[]
  guardOn: boolean
  location?: LocationDescriptor
  snapshot?: AiContextSnapshot
}

export interface AiProposal {
  id: string
  origin: ProposalOrigin
  rootPath: string
  risk: ProposalRisk
  review: ProposalReview
  operations: ProposalOperation[]
  warnings: string[]
  requiresExplicitConfirmation: boolean
  context?: AiContextSnapshot
  location?: LocationDescriptor
}

export interface ChatProposalResult {
  proposal: AiProposal
  invalidActions: { index: number; error: string }[]
}

const proposalId = (origin: ProposalOrigin, operations: ProposalOperation[]) =>
  `${origin}:${operations.map((operation) => operation.id).join(',') || 'empty'}`

function riskFor(operations: ProposalOperation[]): ProposalRisk {
  if (operations.some((operation) => operation.kind === 'trash')) return 'high'
  if (operations.some((operation) => operation.kind === 'move' || operation.kind === 'createFile')) return 'medium'
  return 'low'
}

export function reviewFor(operations: ProposalOperation[], warnings: string[] = [], location?: LocationDescriptor): ProposalReview {
  if (location?.kind === 'network' && operations.some((operation) => operation.kind === 'move' || operation.kind === 'trash')) return 'plan'
  if (operations.some((operation) => operation.kind === 'trash')) return 'plan'
  if (operations.length >= 8 || warnings.length > 0) return 'plan'
  if (operations.length > 1) return 'compact'
  return 'inline'
}

export function createProposal(args: {
  origin: ProposalOrigin
  rootPath: string
  operations: ProposalOperation[]
  warnings?: string[]
  context?: AiContextSnapshot
  location?: LocationDescriptor
}): AiProposal {
  const warnings = args.warnings ?? []
  const risk = riskFor(args.operations)
  return {
    id: proposalId(args.origin, args.operations),
    origin: args.origin,
    rootPath: args.rootPath,
    risk,
    review: reviewFor(args.operations, warnings, args.location),
    operations: args.operations,
    warnings,
    requiresExplicitConfirmation: risk === 'high' || warnings.length > 0 || (args.location?.kind === 'network' && args.operations.length > 0),
    context: args.context,
    location: args.location,
  }
}

function operationFromChatAction(action: ChatAction, index: number, ctx: ValidateCtx): ProposalOperation[] {
  switch (action.type) {
    case 'rename':
      return [{ id: `chat:${index}:rename`, kind: 'rename', path: action.file, newName: action.newName }]
    case 'organize': {
      const folderPath = `${ctx.currentDir.replace(/\/+$/, '')}/${action.dstFolder}`
      return [
        { id: `chat:${index}:folder`, kind: 'createFolder', path: folderPath },
        { id: `chat:${index}:move`, kind: 'move', path: action.file, destDir: folderPath },
      ]
    }
    case 'createFolder':
      return [{ id: `chat:${index}:create-folder`, kind: 'createFolder', path: `${ctx.currentDir.replace(/\/+$/, '')}/${action.folder}` }]
    case 'create':
      return [{ id: `chat:${index}:create-file`, kind: 'createFile', path: action.file, content: action.content }]
    case 'trash':
      return [{ id: `chat:${index}:trash`, kind: 'trash', path: action.file }]
  }
}

/**
 * Convert chat actions into the shared proposal shape.
 *
 * Invalid actions stay visible through `invalidActions` and `warnings`; they
 * never become executable operations. This preserves the existing chat card
 * behaviour while making the proposal seam safe for later adapters.
 */
export function proposalFromChatActions(
  actions: ChatAction[],
  context: ProposalContext,
  origin: ProposalOrigin = 'chat',
): ChatProposalResult {
  const validateContext: ValidateCtx = {
    currentDir: context.currentDir,
    existingNames: context.entries.map((entry) => entry.name),
    guardOn: context.guardOn,
    entries: context.entries,
  }
  const operations: ProposalOperation[] = []
  const invalidActions: { index: number; error: string }[] = []

  actions.forEach((action, index) => {
    const validated = validateChatAction(action, validateContext)
    if (!validated.ok) {
      invalidActions.push({ index, error: validated.error })
      return
    }
    operations.push(...operationFromChatAction(validated.action, index, validateContext))
  })

  return {
    proposal: createProposal({
      origin,
      rootPath: context.currentDir,
      operations,
      warnings: invalidActions.map(({ index, error }) => `action ${index}: ${error}`),
      location: context.location,
      context: context.snapshot ?? snapshotContext({
        rootPath: context.currentDir,
        entries: context.entries,
        selectedPaths: context.selectedPaths,
        guardOn: context.guardOn,
        location: context.location,
      }),
    }),
    invalidActions,
  }
}

/** Convert the Rust-backed Plan adapter into the same semantic proposal view. */
export function proposalFromPlan(plan: Plan): AiProposal {
  const operations: ProposalOperation[] = plan.ops
    .filter((operation) => operation.included && !operation.issue)
    .map((operation) => {
      switch (operation.kind) {
        case 'createFolder':
          return { id: operation.id, kind: 'createFolder' as const, path: operation.path }
        case 'rename':
          return { id: operation.id, kind: 'rename' as const, path: operation.path, newName: operation.newName }
        case 'move':
          return { id: operation.id, kind: 'move' as const, path: operation.path, destDir: operation.destDir }
        case 'trash':
          return { id: operation.id, kind: 'trash' as const, path: operation.path }
      }
    })
  const warnings = [
    ...plan.warnings,
    ...plan.ops.filter((operation) => operation.issue).map((operation) => `${operation.id}: ${operation.issue}`),
  ]
  return createProposal({ origin: 'plan', rootPath: plan.rootPath, operations, warnings })
}
