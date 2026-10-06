/**
 * Shared view-model for mounted volumes (status-bar DiskWidget + Sidebar
 * "Volumi" section). Loads once per mount; surfaces `refresh` for after eject
 * or popover open. Errors degrade to an empty list (the widgets show a hint).
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { ejectVolume, listVolumes, type Volume } from './api'

export interface VolumesModel {
  volumes: Volume[]
  loading: boolean
  error: string
  refresh: () => void
  eject: (mount: string) => Promise<void>
}

let snapshot = { volumes: [] as Volume[], loading: true, error: '' }
const listeners = new Set<() => void>()
let pending: Promise<void> | undefined
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
const getSnapshot = () => snapshot
export function refreshVolumes(): Promise<void> {
  if (pending) return pending
  pending = listVolumes().then((volumes) => {
    snapshot = { volumes: Array.isArray(volumes) ? volumes : [], loading: false, error: '' }
  }).catch((error) => {
    snapshot = { volumes: [], loading: false, error: String(error) }
  }).finally(() => {
    pending = undefined
    listeners.forEach((listener) => listener())
  })
  return pending
}

export function useVolumes(): VolumesModel {
  const { volumes, loading, error } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const refresh = useCallback(() => { void refreshVolumes() }, [])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, 5000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  const eject = useCallback(async (mount: string) => {
    await ejectVolume(mount)
    refresh()
  }, [refresh])

  return { volumes, loading, error, refresh, eject }
}

/** Compact "23 GB free of 240 GB" data for a row, engine-agnostic. */
export function volumeUsage(v: Volume): { pct: number | null } {
  const pct = v.totalBytes > 0 ? Math.round((v.usedBytes / v.totalBytes) * 100) : null
  return { pct }
}
