import type { FileEntry } from '../api.js'
import type { LocationDescriptor } from '../location.js'

export interface AiContextSnapshot {
  rootPath: string
  entries: Pick<FileEntry, 'name' | 'path'>[]
  selectedPaths: string[]
  guardOn: boolean
  location?: LocationDescriptor
  fingerprint: string
}

export interface AiContextInput {
  rootPath: string
  entries: Pick<FileEntry, 'name' | 'path'>[]
  selectedPaths?: string[]
  guardOn: boolean
  location?: LocationDescriptor
}

export function snapshotContext(input: AiContextInput): AiContextSnapshot {
  const entries = input.entries
    .map((entry) => ({ name: entry.name, path: entry.path }))
    .sort((a, b) => a.path.localeCompare(b.path))
  const selectedPaths = [...(input.selectedPaths ?? [])].sort()
  return {
    rootPath: input.rootPath,
    entries,
    selectedPaths,
    guardOn: input.guardOn,
    location: input.location,
    fingerprint: JSON.stringify({ rootPath: input.rootPath, entries, selectedPaths, guardOn: input.guardOn, location: input.location }),
  }
}

export function contextChanged(snapshot: AiContextSnapshot, current: AiContextInput): boolean {
  return snapshot.fingerprint !== snapshotContext(current).fingerprint
}
