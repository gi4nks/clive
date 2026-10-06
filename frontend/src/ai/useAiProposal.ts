import { useCallback, useEffect, useRef, useState } from 'react'
import { applyPlan, undoPlan, type ApplyResult, type Fs } from './apply.js'
import type { AiProposal, ProposalOperation } from './proposal.js'
import { contextChanged, type AiContextInput } from './context.js'
import { reviewProposal } from './reviewProposal.js'
import { listVolumes } from '../api.js'
import { describeLocation } from '../location.js'

export type ProposalPhase = 'idle' | 'applying' | 'applied' | 'failed' | 'cancelled'

export interface ProposalIo {
  fs: Fs
  writeFile: (path: string, content: string) => Promise<void>
  moveToTrash: (path: string) => Promise<void>
  getContext?: () => AiContextInput
  contextChangedMessage?: string
}

export interface ProposalApplyResult extends ApplyResult {
  /** True when at least one mutation was applied outside `applyPlan`. */
  directApplied: number
}

function baseOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i >= 0 ? path.slice(i + 1) : path
}

function folderChain(path: string, rootPath: string): string[] {
  const root = rootPath.replace(/\/+$/, '') || '/'
  const relative = path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path.replace(/^\/+/, '')
  const parts = relative.split('/').filter(Boolean)
  const result: string[] = []
  for (let i = 1; i <= parts.length; i += 1) result.push(`${root}/${parts.slice(0, i).join('/')}`)
  return result
}

/** Apply semantic proposal operations through injected filesystem adapters. */
export async function applyProposal(io: ProposalIo, proposal: AiProposal): Promise<ProposalApplyResult> {
  if (proposal.context && io.getContext && contextChanged(proposal.context, io.getContext())) {
    return {
      applied: 0,
      skipped: 0,
      failures: [{ op: proposal.id, error: io.contextChangedMessage ?? 'AI context changed' }],
      undo: [],
      directApplied: 0,
    }
  }
  const folders = new Set<string>()
  const renames: { path: string; newName: string }[] = []
  const moves: { src: string; dst: string }[] = []
  const direct: ProposalOperation[] = []

  for (const operation of proposal.operations) {
    if (operation.kind === 'createFolder') {
      for (const path of folderChain(operation.path, proposal.rootPath)) folders.add(path)
    } else if (operation.kind === 'rename') {
      renames.push({ path: operation.path, newName: operation.newName })
    } else if (operation.kind === 'move') {
      const name = operation.destName ?? baseOf(operation.path)
      moves.push({ src: operation.path, dst: `${operation.destDir.replace(/\/+$/, '')}/${name}` })
    } else {
      direct.push(operation)
    }
  }

  const batch = await applyPlan(io.fs, {
    folders: [...folders],
    renames,
    moves,
  })
  let directApplied = 0
  const failures = [...batch.failures]

  for (const operation of direct) {
    try {
      if (operation.kind === 'createFile') await io.writeFile(operation.path, operation.content)
      else await io.moveToTrash(operation.path)
      directApplied += 1
    } catch (error) {
      failures.push({ op: `${operation.kind} ${operation.path}`, error: String(error) })
    }
  }

  return {
    applied: batch.applied + directApplied,
    skipped: batch.skipped,
    failures,
    undo: batch.undo,
    directApplied,
  }
}

export function useAiProposal(io: ProposalIo) {
  const ioRef = useRef(io)
  useEffect(() => {
    ioRef.current = io
  }, [io])
  const [phase, setPhase] = useState<ProposalPhase>('idle')
  const [active, setActive] = useState<AiProposal | null>(null)
  const [result, setResult] = useState<ProposalApplyResult | null>(null)

  const apply = useCallback(async (proposal: AiProposal) => {
    if ((proposal.review === 'plan' || proposal.requiresExplicitConfirmation) && !(await reviewProposal(proposal))) {
      return { applied: 0, skipped: proposal.operations.length, failures: [], undo: [], directApplied: 0 }
    }
    setActive(proposal)
    setResult(null)
    setPhase('applying')
    try {
      const expected = proposal.context?.location ?? proposal.location
      if (expected) {
        const current = describeLocation(proposal.rootPath, await listVolumes())
        if (!current.online || current.device !== expected.device || current.mountPoint !== expected.mountPoint) {
          throw new Error(ioRef.current.contextChangedMessage ?? 'AI context changed')
        }
      }
      const next = await applyProposal(ioRef.current, proposal)
      setResult(next)
      setPhase(next.failures.length ? 'failed' : 'applied')
      return next
    } catch (error) {
      const failed: ProposalApplyResult = {
        applied: 0,
        skipped: 0,
        failures: [{ op: proposal.id, error: String(error) }],
        undo: [],
        directApplied: 0,
      }
      setResult(failed)
      setPhase('failed')
      return failed
    }
  }, [])

  const cancel = useCallback(() => {
    setPhase('cancelled')
  }, [])

  const undo = useCallback(async () => {
    if (!result?.undo.length) return null
    const undone = await undoPlan(ioRef.current.fs, result.undo)
    setPhase('idle')
    setActive(null)
    setResult(null)
    return undone
  }, [result])

  return { phase, active, result, apply, cancel, undo }
}
