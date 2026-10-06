import type { Volume } from './api.js'

export type LocationKind = 'local' | 'network' | 'external' | 'unknown'

export interface LocationDescriptor {
  kind: LocationKind
  path: string
  mountPoint?: string
  volumeName?: string
  device?: string
  online: boolean
}

/** Return the mounted volume containing `path`, preferring the deepest mount. */
export function volumeForPath(path: string, volumes: Volume[]): Volume | undefined {
  return volumes
    .filter((volume) => path === volume.mountPoint || path.startsWith(`${volume.mountPoint.replace(/\/$/, '')}/`))
    .sort((a, b) => b.mountPoint.length - a.mountPoint.length)[0]
}

/** Classify a filesystem path without ever treating smb:// as a local path. */
export function describeLocation(path: string, volumes: Volume[] = []): LocationDescriptor {
  const normalized = path.trim()
  if (!normalized.startsWith('/') || normalized.startsWith('//') || normalized.split('/').includes('..')) {
    return { kind: 'unknown', path: normalized, online: false }
  }

  const volume = volumeForPath(normalized, volumes)
  if (normalized.startsWith('/Volumes/') && volume?.mountPoint === '/') {
    return { kind: 'unknown', path: normalized, online: false }
  }
  if (!volume) return { kind: 'unknown', path: normalized, online: false }
  return {
    kind: volume.kind === 'network' ? 'network' : volume.kind === 'external' ? 'external' : 'local',
    path: normalized,
    mountPoint: volume.mountPoint,
    volumeName: volume.name,
    device: volume.device,
    online: true,
  }
}
