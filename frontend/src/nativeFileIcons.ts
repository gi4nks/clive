import { getFileIcons, type FileEntry } from './api'

const nativeIcons = new Map<string, { signature: string; dataUrl?: string }>()
const requestedIcons = new Map<string, string>()
const listeners = new Set<() => void>()
let version = 0

export function subscribeNativeIcons(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function nativeIconsVersion() {
  return version
}

function notifyNativeIcons() {
  version += 1
  listeners.forEach((listener) => listener())
}

function iconSignature(entry: FileEntry) {
  return `${entry.modified}:${entry.size}`
}

export function nativeIconFor(entry: FileEntry): string | undefined {
  const cached = nativeIcons.get(entry.path)
  return cached?.signature === iconSignature(entry) ? cached.dataUrl : undefined
}

/** Fetch macOS icons in batches after the listing is already visible. */
export async function loadNativeIcons(entries: FileEntry[]): Promise<boolean> {
  let loaded = false
  const missing = entries.filter((entry) => {
    const cached = nativeIcons.get(entry.path)
    return (!cached || cached.signature !== iconSignature(entry)) && requestedIcons.get(entry.path) !== iconSignature(entry)
  })
  for (let i = 0; i < missing.length; i += 128) {
    const batch = missing.slice(i, i + 128)
    batch.forEach((entry) => requestedIcons.set(entry.path, iconSignature(entry)))
    try {
      const icons = await getFileIcons(batch.map((entry) => entry.path))
      const byPath = new Map(icons.map((icon) => [icon.path, icon.dataUrl]))
      let batchLoaded = false
      for (const entry of batch) {
        const dataUrl = byPath.get(entry.path)
        nativeIcons.set(entry.path, { signature: iconSignature(entry), dataUrl })
        batchLoaded ||= !!dataUrl
      }
      if (batchLoaded) {
        loaded = true
        notifyNativeIcons()
      }
    } catch {
      // Browser previews and non-macOS builds keep the built-in fallback icons.
      for (const entry of batch) nativeIcons.set(entry.path, { signature: iconSignature(entry) })
    }
  }
  while (nativeIcons.size > 4096) {
    const oldest = nativeIcons.keys().next().value!
    nativeIcons.delete(oldest)
    requestedIcons.delete(oldest)
  }
  return loaded
}
