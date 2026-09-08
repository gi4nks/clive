/**
 * Chat AI pure layer (v1). Types, action-marker parsing, action validation,
 * prompt assembly, history trimming. No React, no I/O — everything here is
 * unit-testable without mocking.
 */

export const ACTIONS_OPEN = '<<<ACTIONS>>>'
export const ACTIONS_CLOSE = '<<<END>>>'

export type ChatActionType = 'rename' | 'organize' | 'create' | 'trash'

export interface RenameAction { type: 'rename'; file: string; newName: string }
export interface OrganizeAction { type: 'organize'; file: string; dstFolder: string }
export interface CreateAction { type: 'create'; file: string; content: string }
export interface TrashAction { type: 'trash'; file: string }

export type ChatAction = RenameAction | OrganizeAction | CreateAction | TrashAction

export interface ParsedActions { text: string; actions: ChatAction[] }

const ACTION_TYPES = new Set<ChatActionType>(['rename', 'organize', 'create', 'trash'])

function isActionType(v: unknown): v is ChatActionType {
  return typeof v === 'string' && ACTION_TYPES.has(v as ChatActionType)
}

function isValidAction(a: unknown): a is ChatAction {
  if (typeof a !== 'object' || a === null) return false
  const obj = a as Record<string, unknown>
  if (!isActionType(obj.type)) return false
  switch (obj.type) {
    case 'rename':
      return typeof obj.file === 'string' && typeof obj.newName === 'string'
    case 'organize':
      return typeof obj.file === 'string' && typeof obj.dstFolder === 'string'
    case 'create':
      return typeof obj.file === 'string' && typeof obj.content === 'string'
    case 'trash':
      return typeof obj.file === 'string'
  }
}

/**
 * Given a raw assistant message, split it into visible text and validated actions.
 * Tolerant: unknown types are dropped, malformed JSON leaves the block in `text`.
 */
export function extractActions(raw: string): ParsedActions {
  const re = /<<<ACTIONS>>>([\s\S]*?)<<<END>>>/i
  const m = re.exec(raw)
  if (!m) return { text: raw, actions: [] }
  try {
    const parsed = JSON.parse(m[1].trim()) as unknown
    if (typeof parsed !== 'object' || parsed === null) return { text: raw, actions: [] }
    const arr = (parsed as { actions?: unknown }).actions
    if (!Array.isArray(arr)) return { text: raw, actions: [] }
    const actions = arr.filter(isValidAction)
    const text = raw.slice(0, m.index) + raw.slice(m.index + m[0].length)
    return { text: text.trimEnd(), actions }
  } catch {
    return { text: raw, actions: [] }
  }
}
