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
export function archiveCrumbPath(base: string, segs: string[], zipFile: string): string {
  return joinArchivePath(zipFile, segs.join('/'))
}

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
