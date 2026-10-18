/**
 * Reads file contents for AI context assembly. All AI-proposed mutations are
 * executed by the Rust plan journal through the shared proposal controller.
 */
import { readTextFile } from '../api.js'
import type { FileContent } from './budget.js'
import type { FileEntry } from '../api.js'

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
