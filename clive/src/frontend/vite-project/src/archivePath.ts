/**
 * Pseudo-path codec for read-only archive browsing (browse-zip-archives).
 * An archive inner path is `<archive.zip>!/entry/dir/file.ext`; `!/` cannot
 * occur in real macOS paths, so the namespace is unambiguous. This module is
 * the ONLY place allowed to build or split such paths.
 */

export const ARCHIVE_SEP = '!/'

export function isArchivePath(path: string): boolean {
  return path.includes(ARCHIVE_SEP)
}

export interface ArchivePathParts {
  /** Real filesystem path of the .zip file. */
  archive: string
  /** Member path inside the archive ('' = archive root). */
  inner: string
}

export function splitArchivePath(path: string): ArchivePathParts | null {
  const i = path.indexOf(ARCHIVE_SEP)
  if (i < 0) return null
  return { archive: path.slice(0, i), inner: path.slice(i + ARCHIVE_SEP.length).replace(/^\/+/, '') }
}

export function joinArchivePath(archive: string, inner: string): string {
  return `${archive}${ARCHIVE_SEP}${inner.replace(/^\/+/, '')}`
}

/** Parent of an inner path (archive root is a folder; its parent is the zip file itself). */
export function archiveParent(path: string): string {
  const parts = splitArchivePath(path)
  if (!parts) return parentOfReal(path)
  const trimmed = parts.inner.replace(/\/+$/, '')
  const cut = trimmed.lastIndexOf('/')
  if (cut < 0) return parts.archive
  return joinArchivePath(parts.archive, trimmed.slice(0, cut))
}

export function archiveBasename(path: string): string {
  const parts = splitArchivePath(path)
  if (!parts) return basenameOfReal(path)
  const trimmed = parts.inner.replace(/\/+$/, '')
  if (!trimmed) return basenameOfReal(parts.archive)
  return trimmed.slice(trimmed.lastIndexOf('/') + 1)
}

/** Segments for the breadcrumb: real crumbs, then the zip crumb, then inner crumbs. */
function parentOfReal(p: string): string {
  const trimmed = p.replace(/\/+$/, '')
  const i = trimmed.lastIndexOf('/')
  return i > 0 ? trimmed.slice(0, i) : '/'
}
function basenameOfReal(p: string): string {
  return p.replace(/\/+$/, '').split('/').pop() || p
}

/** True when browsing `path` is read-only (inside an archive; even its root listing). */
export function isInsideArchive(path: string): boolean {
  return isArchivePath(path)
}

/** The real filesystem path backing a pseudo-path (the .zip itself). */
export function archiveRealPath(path: string): string {
  return splitArchivePath(path)?.archive ?? path
}

export interface ArchiveListingRow {
  name: string
  /** Pseudo-path of the row (`archive.zip!/relative`). */
  path: string
  isDir: boolean
  size: number
  modified: number
  extension: string | null
}

/**
 * Fold flat zip members into folder-like rows for the current inner prefix,
 * mirroring listDir output shape. Duplicate dir members dedupe on first-seen.
 */
export function listArchiveEntries(
  archive: string,
  inner: string,
  entries: { name: string; isDir: boolean; size: number; modified: number }[],
): { rows: ArchiveListingRow[]; names: string[] } {
  const prefix = inner ? `${inner.replace(/\/+$/, '')}/` : ''
  const byKey = new Map<string, ArchiveListingRow>()
  const names: string[] = []
  for (const e of entries) {
    const name = e.name.replace(/\/+$/, '')
    if (!name || (prefix && name + '/' === prefix)) continue
    if (prefix && !name.startsWith(prefix)) continue
    const rest = prefix ? name.slice(prefix.length) : name
    if (!rest) continue
    const slash = rest.indexOf('/')
    if (slash < 0) {
      const isDir = e.isDir
      if (!byKey.has(rest)) {
        const dot = rest.lastIndexOf('.')
        byKey.set(rest, {
          name: rest,
          path: joinArchivePath(archive, name),
          isDir,
          size: isDir ? 0 : e.size,
          modified: e.modified,
          extension: isDir || dot <= 0 ? null : rest.slice(dot + 1).toLowerCase(),
        })
        names.push(rest)
      } else if (!isDir) {
        byKey.get(rest)!.size += e.size
      }
    } else {
      const dirName = rest.slice(0, slash)
      if (!byKey.has(dirName)) {
        byKey.set(dirName, { name: dirName, path: joinArchivePath(archive, `${prefix}${dirName}`), isDir: true, size: 0, modified: e.modified, extension: null })
        names.push(dirName)
      }
      if (!e.isDir) {
        const d = byKey.get(dirName)!
        d.size += e.size
      }
    }
  }
  return { rows: [...byKey.values()], names }
}
