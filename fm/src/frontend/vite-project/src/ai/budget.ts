/**
 * Input budgeting for AI prompts (task 1.9).
 *
 * Bounds how much file content is sent to a model: a per-file byte cap and a
 * total cap, with head+tail truncation and an explicit marker. Binary or
 * oversized non-text files are reduced to metadata-only. Pure functions, no I/O
 * (the caller supplies raw file text via `read_text_file`).
 */

export interface BudgetOptions {
  /** Max bytes taken from a single file. Default 24 KB. */
  perFileBytes?: number
  /** Max total bytes across all files in one prompt. Default 96 KB. */
  totalBytes?: number
}

export interface FileContent {
  path: string
  name: string
  size: number
  isDir: boolean
  /** Raw UTF-8 text, or null for binary/dir. */
  text: string | null
}

export interface BudgetedFile {
  path: string
  name: string
  /** Text actually included (possibly truncated). */
  body: string
  truncated: boolean
  /** Why the full text was not included, if not included. */
  note?: string
}

const DEFAULT_PER_FILE = 24 * 1024
const DEFAULT_TOTAL = 96 * 1024
const TRUNC_MARK = '\n…[troncato]…\n'

/** Heuristic: a string is treated as text if it has no NUL and few control chars. */
export function looksLikeText(text: string): boolean {
  if (text.includes('\u0000')) return false
  const sample = text.slice(0, 4096)
  let control = 0
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i)
    if (c < 9 || (c > 13 && c < 32)) control++
  }
  return control / Math.max(1, sample.length) < 0.1
}

/** Keep head + tail of a byte-limited window so it stays under `limit` bytes. */
function truncate(text: string, limit: number): { body: string; truncated: boolean } {
  const bytes = new TextEncoder().encode(text)
  if (bytes.length <= limit) return { body: text, truncated: false }
  // Leave room for the marker (UTF-16 length here is an approximation; we
  // re-measure after slicing by decoding a safe window).
  const markerBytes = new TextEncoder().encode(TRUNC_MARK).length
  const keep = Math.max(0, limit - markerBytes)
  const half = Math.floor(keep / 2)
  const head = decodeWindow(text, 0, half)
  const tail = decodeTail(text, half)
  return { body: head + TRUNC_MARK + tail, truncated: true }
}

function decodeWindow(text: string, startChar: number, byteLen: number): string {
  const enc = new TextEncoder()
  let acc = 0
  let i = startChar
  for (; i < text.length && acc < byteLen; i++) acc += enc.encode(text[i]).length
  return text.slice(startChar, i)
}

function decodeTail(text: string, byteLen: number): string {
  const enc = new TextEncoder()
  let acc = 0
  let i = text.length - 1
  for (; i >= 0 && acc < byteLen; i--) acc += enc.encode(text[i]).length
  return text.slice(i + 1)
}

/**
 * Build the budgeted prompt blocks for the given files. Dir entries and
 * non-text/binary files are summarized by name+size only. When vision is not
 * available, images likewise fall back to metadata (the caller decides whether
 * to include the image itself through another channel).
 */
export function budgetFiles(files: FileContent[], opts: BudgetOptions = {}): BudgetedFile[] {
  const perFile = opts.perFileBytes ?? DEFAULT_PER_FILE
  const total = opts.totalBytes ?? DEFAULT_TOTAL
  const out: BudgetedFile[] = []
  let used = 0

  for (const f of files) {
    if (f.isDir || f.text === null || !looksLikeText(f.text)) {
      out.push({
        path: f.path,
        name: f.name,
        body: `[${f.isDir ? 'dir' : 'bin'} · ${f.size} byte]`,
        truncated: false,
        note: 'metadata only',
      })
      continue
    }
    const remaining = total - used
    if (remaining <= 0) {
      out.push({ path: f.path, name: f.name, body: '', truncated: true, note: 'total budget exhausted' })
      continue
    }
    const limit = Math.min(perFile, remaining)
    const { body, truncated } = truncate(f.text, limit)
    used += new TextEncoder().encode(body).length
    out.push({ path: f.path, name: f.name, body, truncated, note: truncated ? 'content truncated' : undefined })
  }
  return out
}

/** Render budgeted files as a compact, delimited prompt string. */
export function renderBudgeted(blocks: BudgetedFile[]): string {
  return blocks
    .map((b) => {
      const meta = b.note ? ` (${b.note})` : ''
      if (!b.body) return `### ${b.name}${meta}\n`
      return `### ${b.name}${meta}\n${b.body}`
    })
    .join('\n\n')
}
