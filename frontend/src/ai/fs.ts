/**
 * Reads file contents for AI context assembly. All AI-proposed mutations are
 * executed by the Rust plan journal through the shared proposal controller.
 */
import { readFileBytes, readTextFile } from '../api.js'
import type { FileContent } from './budget.js'
import type { FileEntry } from '../api.js'
import { imageMimeType, isImageName } from './capabilities.js'

const MAX_TEXT_BYTES = 512 * 1024
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_IMAGE_COUNT = 4

export interface CollectFileOptions {
  includeImages?: boolean
}

/** Read budgeting inputs for the given entries; failures → metadata-only. */
export async function collectFileContents(
  entries: FileEntry[],
  options?: CollectFileOptions,
): Promise<FileContent[]> {
  let imageBudget = options?.includeImages ? MAX_IMAGE_COUNT : 0
  return Promise.all(
    entries.map(async (e) => {
      if (e.isDir) {
        return { path: e.path, name: e.name, size: e.size, isDir: true, text: null }
      }
      if (isImageName(e.name, e.extension)) {
        if (imageBudget > 0 && e.size <= MAX_IMAGE_BYTES) {
          imageBudget--
          try {
            const imageBase64 = await readFileBytes(e.path)
            if (imageBase64) {
              return {
                path: e.path,
                name: e.name,
                size: e.size,
                isDir: false,
                text: null,
                imageBase64,
                imageMimeType: imageMimeType(e.name, e.extension) ?? 'image/png',
              }
            }
          } catch {
            /* fall back to metadata-only */
          }
        }
        return { path: e.path, name: e.name, size: e.size, isDir: false, text: null }
      }
      let text: string | null = null
      if (e.size <= MAX_TEXT_BYTES) {
        try {
          text = await readTextFile(e.path)
        } catch {
          text = null
        }
      }
      return { path: e.path, name: e.name, size: e.size, isDir: false, text }
    }),
  )
}
