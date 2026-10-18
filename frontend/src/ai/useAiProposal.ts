import { useCallback, useEffect, useRef, useState } from 'react'
import { applyPlan as applyMutationBatch, undoPlan as undoMutationBatch } from '../api.js'
import type { ApplyPlanOp, ApplyReport } from '../api.js'
import type { AiProposal, ProposalOperation } from './proposal.js'
import { contextChanged, type AiContextInput } from './context.js'
import { reviewProposal } from './reviewProposal.js'
import { listVolumes } from '../api.js'
import { describeLocation } from '../location.js'

export type ProposalPhase = 'idle' | 'applying' | 'applied' | 'failed' | 'cancelled'

export interface ProposalIo {
  getContext?: () => AiContextInput
  contextChangedMessage?: string
}

export interface ProposalApplyResult {
  applied: number
  skipped: number
  failures: { op: string; error: string }[]
  /** Durable Rust journal id used to undo or retry a partial undo. */
  batchId: string | null
}

const newBatchId = (): string => {
  const cryptoApi = globalThis.crypto as Crypto & { randomUUID?: () => string }
  return cryptoApi.randomUUID?.() ?? `proposal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function toPlanOps(operation: ProposalOperation, rootPath: string): ApplyPlanOp[] {
  switch (operation.kind) {
    case 'createFolder': {
      const root = rootPath.replace(/\/+$/, '') || '/'
      const prefix = root === '/' ? '/' : `${root}/`
      const relative = operation.path === root ? '' : operation.path.startsWith(prefix) ? operation.path.slice(prefix.length) : ''
      if (!relative) return [{ id: operation.id, kind: operation.kind, path: operation.path, included: true }]
      const parts = relative.split('/').filter(Boolean)
      return parts.map((_part, index) => ({
        id: `${operation.id}:parent:${index}`,
        kind: operation.kind,
        path: `${root === '/' ? '' : root}/${parts.slice(0, index + 1).join('/')}` || '/',
        included: true,
      }))
    }
    case 'createFile': return [{ id: operation.id, kind: operation.kind, path: operation.path, content: operation.content, included: true }]
    case 'rename': return [{ id: operation.id, kind: operation.kind, path: operation.path, newName: operation.newName, included: true }]
    case 'move': return [{ id: operation.id, kind: operation.kind, path: operation.path, destDir: operation.destDir, ...(operation.destName ? { destName: operation.destName } : {}), included: true }]
    case 'trash': return [{ id: operation.id, kind: operation.kind, path: operation.path, included: true }]
  }
}

const fromReport = (report: ApplyReport): ProposalApplyResult => ({
  applied: report.applied,
  skipped: report.skipped,
  failures: report.failed.map(({ id, error }) => ({ op: id, error })),
  batchId: report.batchId,
})

/** Validate the captured context, then apply every proposal through Rust's durable batch journal. */
export async function applyProposal(io: ProposalIo, proposal: AiProposal): Promise<ProposalApplyResult> {
  if (proposal.context && io.getContext && contextChanged(proposal.context, io.getContext())) {
    return {
      applied: 0,
      skipped: 0,
      failures: [{ op: proposal.id, error: io.contextChangedMessage ?? 'AI context changed' }],
      batchId: null,
    }
  }

  const expected = proposal.context?.location ?? proposal.location
  if (expected) {
    const current = describeLocation(proposal.rootPath, await listVolumes())
    if (!current.online || current.device !== expected.device || current.mountPoint !== expected.mountPoint) {
      return {
        applied: 0,
        skipped: 0,
        failures: [{ op: proposal.id, error: io.contextChangedMessage ?? 'AI context changed' }],
        batchId: null,
      }
    }
  }

  if (!proposal.operations.length) return { applied: 0, skipped: 0, failures: [], batchId: null }
  return fromReport(await applyMutationBatch(newBatchId(), proposal.operations.flatMap((operation) => toPlanOps(operation, proposal.rootPath))))
}

export function useAiProposal(io: ProposalIo) {
  const ioRef = useRef(io)
  useEffect(() => { ioRef.current = io }, [io])
  const [phase, setPhase] = useState<ProposalPhase>('idle')
  const [active, setActive] = useState<AiProposal | null>(null)
  const [result, setResult] = useState<ProposalApplyResult | null>(null)

  const apply = useCallback(async (proposal: AiProposal) => {
    if ((proposal.review === 'plan' || proposal.requiresExplicitConfirmation) && !(await reviewProposal(proposal))) {
      return { applied: 0, skipped: proposal.operations.length, failures: [], batchId: null }
    }
    setActive(proposal)
    setResult(null)
    setPhase('applying')
    try {
      const next = await applyProposal(ioRef.current, proposal)
      setResult(next)
      setPhase(next.failures.length ? 'failed' : 'applied')
      return next
    } catch (error) {
      const failed: ProposalApplyResult = {
        applied: 0,
        skipped: 0,
        failures: [{ op: proposal.id, error: String(error) }],
        batchId: null,
      }
      setResult(failed)
      setPhase('failed')
      return failed
    }
  }, [])

  const cancel = useCallback(() => setPhase('cancelled'), [])

  const undo = useCallback(async () => {
    if (!result?.batchId) return null
    const undone = fromReport(await undoMutationBatch(result.batchId))
    if (undone.failures.length) {
      setResult(undone)
      setPhase('failed')
    } else {
      setPhase('idle')
      setActive(null)
      setResult(null)
    }
    return undone
  }, [result])

  return { phase, active, result, apply, cancel, undo }
}
