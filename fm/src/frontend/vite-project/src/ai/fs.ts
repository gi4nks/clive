/**
 * Bridges the pure AI layers (`apply`, `budget`, `actions`) to the real Tauri
 * IPC commands and filesystem. Kept tiny and side-effecting so the modules it
 * feeds stay testable.
 */
import { createFolder, listDir, moveFile, readTextFile, rename as renameCmd, writeTextFile } from '../api'
import type { Fs } from './apply'
import type { FileContent } from './budget'
import type { FileEntry } from '../api'

function split(path: string): { parent: string; name: string } {
  const i = path.lastIndexOf('/')
  return { parent: i > 0 ? path.slice(0, i) : '/', name: path.slice(i + 1) }
}

export const fs: Fs = {
  exists: async (path) => {
    const { parent, name } = split(path)
    try {
      const items = await listDir(parent, true)
      return items.some((i) => i.name === name)
    } catch {
      return false
    }
  },
  rename: (path, newName) => renameCmd(path, newName),
  move: (src, dst) => moveFile(src, dst),
  createFolder: (parent, name) => createFolder(parent, name),
}

/** Write a new file (used by "Generate content" after confirmation). */
export async function writeFile(path: string, content: string): Promise<void> {
  await writeTextFile(path, content)
}

/** Read budgeting inputs for the given entries; failures → metadata-only. */
export async function collectFileContents(entries: FileEntry[]): Promise<FileContent[]> {
  return Promise.all(
    entries.map(async (e) => {
      let text: string | null = null
      if (!e.isDir && e.size <= 512 * 1024) {
        try {
          text = await readTextFile(e.path)
        } catch {
          text = null
        }
      }
      return { path: e.path, name: e.name, size: e.size, isDir: e.isDir, text }
    }),
  )
}
