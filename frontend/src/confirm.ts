/**
 * In-app confirmation (replaces window.confirm): WKWebView never shows JS
 * dialogs — `window.confirm` silently returns false, which turned every
 * gated action (eject, provider removal, guard-off, reset) into a no-op.
 * `confirmAsk` resolves when the user answers the modal hosted by `App`.
 */
import { useSyncExternalStore } from 'react'
import i18n from './i18n'

export interface ConfirmRequest {
  title: string
  message: string
  danger: boolean
  acceptLabel: string
}

interface State {
  req: ConfirmRequest | null
  resolve: ((ok: boolean) => void) | null
}

let state: State = { req: null, resolve: null }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function askState(): State {
  return state
}

/** Ask the user; resolves true only on explicit accept. */
export function confirmAsk(message: string, opts: { title?: string; danger?: boolean; acceptLabel?: string } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    state.resolve?.(false) // cancel any pending ask
    state = {
      req: {
        title: opts.title ?? i18n.t('common.confirm'),
        message,
        danger: opts.danger ?? false,
        acceptLabel: opts.acceptLabel ?? i18n.t('common.confirm'),
      },
      resolve,
    }
    emit()
  })
}

export function answerConfirm(ok: boolean): void {
  const r = state.resolve
  state = { req: null, resolve: null }
  emit()
  r?.(ok)
}

export function useConfirmRequest(): State {
  return useSyncExternalStore(subscribe, askState, askState)
}
