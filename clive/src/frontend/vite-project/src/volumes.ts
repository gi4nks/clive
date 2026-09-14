/**
 * Shared view-model for mounted volumes (status-bar DiskWidget + Sidebar
 * "Volumi" section). Loads once per mount; surfaces `refresh` for after eject
 * or popover open. Errors degrade to an empty list (the widgets show a hint).
 */
import { useCallback, useEffect, useState } from 'react'
import { ejectVolume, listVolumes, type Volume } from './api'

export interface VolumesModel {
  volumes: Volume[]
  loading: boolean
  error: string
  refresh: () => void
  eject: (mount: string) => Promise<void>
}

export function useVolumes(): VolumesModel {
  const [volumes, setVolumes] = useState<Volume[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(() => {
    listVolumes()
      .then((v) => {
        setVolumes(Array.isArray(v) ? v : [])
        setError('')
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()
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
