import { useCallback, useEffect, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import {
  clearClipboard,
  copyPaths,
  cutPaths,
  getClipboard,
  pastePaths,
  type ClipboardInfo,
  type FileEntry,
} from './api.js'
import type { PaneId, PaneState } from './FilePane.js'
import { isArchivePath } from './archivePath.js'
import { transferBatch } from './transfer.js'
import i18n from './i18n'

type TransferRequest = { mode: 'copy' | 'move'; paths: string[] }
type PanesRef = MutableRefObject<Record<PaneId, PaneState>>

interface TransferWorkflowOptions {
  active: PaneId
  currentPath: string
  panesRef: PanesRef
  setPanes: Dispatch<SetStateAction<Record<PaneId, PaneState>>>
  selectedEntries: FileEntry[]
  refresh: (path: string) => Promise<void>
  refreshPane: (id: PaneId, path: string) => Promise<void>
  expandPane: (id: PaneId) => void
  assertWritable: () => boolean
  setStatus: (message: string, type?: 'success' | 'error' | 'info', timeout?: number) => void
}

/** Owns clipboard state and file transfer workflows across both panes. */
export function useTransferWorkflow({
  active,
  currentPath,
  panesRef,
  setPanes,
  selectedEntries,
  refresh,
  refreshPane,
  expandPane,
  assertWritable,
  setStatus,
}: TransferWorkflowOptions) {
  const [clip, setClip] = useState<ClipboardInfo>({ paths: [], operation: null })
  const [transferReq, setTransferReq] = useState<TransferRequest | null>(null)
  const [pasteInFlight, setPasteInFlight] = useState(false)

  useEffect(() => {
    void getClipboard().then(setClip).catch(() => { /* no clipboard yet */ })
  }, [])

  const handleCopyCut = useCallback(async (op: 'copy' | 'move') => {
    if (!assertWritable()) return
    const paths = selectedEntries.map((entry) => entry.path)
    if (!paths.length) return
    try {
      if (op === 'copy') await copyPaths(paths)
      else await cutPaths(paths)
      setClip(await getClipboard())
      setStatus(i18n.t(op === 'copy' ? 'status.copied' : 'status.cut', { count: paths.length }), 'success')
    } catch (error) {
      setStatus(String(error), 'error')
    }
  }, [assertWritable, selectedEntries, setStatus])

  const handlePaste = useCallback(async () => {
    if (!clip.paths.length || !assertWritable()) return
    setPasteInFlight(true)
    try {
      await pastePaths(currentPath)
      setClip(await getClipboard())
      await refresh(currentPath)
      setStatus(i18n.t('status.pasted'), 'success')
    } catch (error) {
      setStatus(String(error), 'error')
    } finally {
      setPasteInFlight(false)
    }
  }, [clip, assertWritable, currentPath, refresh, setStatus])

  const handleClearClip = useCallback(async () => {
    await clearClipboard()
    setClip({ paths: [], operation: null })
    setStatus(i18n.t('status.clipboardCleared'), 'success')
  }, [setStatus])

  const applyTransfer = useCallback(async (dstDir: string, srcPaths: string[], mode: 'copy' | 'move') => {
    if (!srcPaths.length) return
    if (isArchivePath(dstDir) || srcPaths.some(isArchivePath)) {
      setStatus(i18n.t('archive.readOnly'), 'error')
      return
    }
    const result = await transferBatch(srcPaths, dstDir, mode)
    if (result.applied) setStatus(i18n.t(mode === 'copy' ? 'transfer.done' : 'transfer.moved', { count: result.applied }), 'success')
    if (result.nonAtomic) setStatus(i18n.t('transfer.nonAtomic'), 'info')
    if (result.failures.length) setStatus(i18n.t('transfer.failed', { count: result.failures.length }), 'error')
    const panes = panesRef.current
    await Promise.all([refreshPane('left', panes.left.path), refreshPane('right', panes.right.path)])
  }, [panesRef, refreshPane, setStatus])

  const handleTransfer = useCallback(async (dstDir: string) => {
    const request = transferReq
    if (!request) return
    setTransferReq(null)
    await applyTransfer(dstDir, request.paths, request.mode)
  }, [transferReq, applyTransfer])

  const swapPanes = useCallback(() => {
    setPanes((previous) => ({ left: previous.right, right: previous.left }))
  }, [setPanes])

  const sendToOtherPane = useCallback((mode: 'copy' | 'move') => {
    const source = panesRef.current[active]
    const other: PaneId = active === 'left' ? 'right' : 'left'
    const destination = panesRef.current[other].path
    if (!destination) return
    expandPane(other)
    void applyTransfer(destination, [...source.selected], mode)
  }, [active, panesRef, expandPane, applyTransfer])

  const dropIntoPane = useCallback((id: PaneId, srcPaths: string[], copy: boolean) => {
    const destination = (panesRef.current[id].path || '').replace(/\/+$/, '')
    if (!destination || !srcPaths.length) return
    const parentOf = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/'
    const normalize = (path: string) => path.replace(/\/+$/, '') || '/'
    if (srcPaths.every((path) => normalize(parentOf(path)) === normalize(destination))) return
    void applyTransfer(destination, srcPaths, copy ? 'copy' : 'move')
  }, [panesRef, applyTransfer])

  const dropToDir = useCallback((dir: string, srcPaths: string[], copy: boolean) => {
    if (!dir) return
    void applyTransfer(dir, srcPaths, copy ? 'copy' : 'move')
  }, [applyTransfer])

  return {
    clip,
    pasteInFlight,
    transferReq,
    setTransferReq,
    handleCopyCut,
    handlePaste,
    handleClearClip,
    applyTransfer,
    handleTransfer,
    swapPanes,
    sendToOtherPane,
    dropIntoPane,
    dropToDir,
  }
}
