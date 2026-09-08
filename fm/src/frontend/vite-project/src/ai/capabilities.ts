/**
 * Model capability metadata + gating (task 1.11).
 *
 * The gateway exposes models with only an id + owned_by, so we derive a
 * conservative capability profile from the model id. Pure functions → unit
 * testable. Unknown models fall back to safe defaults (no vision, small ctx).
 */
import i18n from '../i18n'

export interface ModelCapabilities {
  supportsVision: boolean
  maxContextTokens: number
}

/** Name fragments that indicate a vision-capable (image-input) model. */
const VISION_MARKERS = [
  'llava',
  'minicpm-v',
  'qwen-vl',
  'qwen2.5-vl',
  'qwen2-vl',
  'bakllava',
  'moondream',
  'gemma3',
  'pixtral',
  'vision',
  '-vl',
  'llama3.2-vision',
  'llama-3.2-vision',
]

/** Ordered context-window heuristics (first match wins). */
const CONTEXT_RULES: Array<[RegExp, number]> = [
  [/gemini/, 1_000_000],
  [/claude/, 200_000],
  [/gpt-4[.\d]*|o[134]-?/, 128_000],
  [/llama-?3[.-]?[13]/, 128_000],
  [/llama-?3[.-]?2/, 128_000],
  [/qwen2[.-]?5/, 128_000],
  [/mistral|mixtral/, 32_768],
]

const DEFAULT_CONTEXT = 8_192
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'bmp', 'tiff']

export function modelCapabilities(modelId: string): ModelCapabilities {
  const id = (modelId ?? '').toLowerCase()
  const supportsVision = VISION_MARKERS.some((m) => id.includes(m))
  let maxContextTokens = DEFAULT_CONTEXT
  for (const [re, n] of CONTEXT_RULES) {
    if (re.test(id)) {
      maxContextTokens = n
      break
    }
  }
  return { supportsVision, maxContextTokens }
}

export function isImageName(name: string, extension?: string | null): boolean {
  const ext = (extension ?? name.split('.').pop() ?? '').toLowerCase()
  return IMAGE_EXTS.includes(ext)
}

export interface VisionGate {
  /** Number of selected images the model cannot ingest. */
  imagesSkipped: number
  /** True when selection is *only* images and vision is missing. */
  blocked: boolean
  note: string | null
}

/** Decide how a vision-incapable model should treat an image-bearing selection. */
export function visionGate(
  entries: Array<{ name: string; extension?: string | null }>,
  caps: ModelCapabilities,
): VisionGate {
  const images = entries.filter((e) => isImageName(e.name, e.extension))
  const imagesSkipped = caps.supportsVision ? 0 : images.length
  const blocked = !caps.supportsVision && images.length > 0 && images.length === entries.length
  const note =
    imagesSkipped > 0 ? i18n.t('ai.visionSkipped', { count: imagesSkipped }) : null
  return { imagesSkipped, blocked, note }
}
