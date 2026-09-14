/** Shared execution policy for model calls. Keeps timeout/cancellation
 * semantics at one seam instead of re-implementing them in every AI feature. */
export class AiExecutionError extends Error {
  readonly code: 'timeout' | 'aborted' | 'provider'

  constructor(code: 'timeout' | 'aborted' | 'provider', message: string) {
    super(message)
    this.name = 'AiExecutionError'
    this.code = code
  }
}

/** Convert SDK/gateway failures into a stable user-facing message while
 * retaining the original provider detail for the debug log. */
export function describeAiError(error: unknown): string {
  if (error instanceof AiExecutionError) {
    return error.code === 'timeout' ? 'AI provider timed out' : error.code === 'aborted' ? 'AI request cancelled' : error.message
  }
  if (error instanceof Error) {
    const message = error.message.replace(/^AI_APICallError:\s*/i, '')
    return message || 'AI provider request failed'
  }
  return String(error) || 'AI provider request failed'
}

export function linkedAbortController(signal: AbortSignal | undefined, timeoutMs: number | undefined) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let externalAbort = false
  const abort = () => {
    externalAbort = true
    controller.abort()
  }
  if (signal) {
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  }
  if (timeoutMs !== undefined && timeoutMs > 0) {
    timer = setTimeout(() => controller.abort(), timeoutMs)
  }
  return {
    signal: controller.signal,
    finish() {
      if (timer) clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    },
    error(message = 'AI generation timed out') {
      return new AiExecutionError(externalAbort ? 'aborted' : 'timeout', message)
    },
  }
}
