import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { usePlanDebug, type PlanDebugLog } from "./usePlanDebug"
import { checkHealth, resolveGatewayBase, type AiHealth } from "./runtime"

export interface AiDebugModalProps {
  open: boolean
  onClose: () => void
}

export function AiDebugModal({ open, onClose }: AiDebugModalProps) {
  const { t } = useTranslation()
  const { logs, clearLogs, subscribe } = usePlanDebug()
  const [health, setHealth] = useState<AiHealth | null>(null)
  const [base, setBase] = useState<string>("")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    return subscribe()
  }, [subscribe])

  useEffect(() => {
    if (!open) return
    let active = true
    void checkHealth().then((h) => {
      if (active) setHealth(h)
    })
    void resolveGatewayBase().then((b) => {
      if (active) setBase(b)
    })
    return () => {
      active = false
    }
  }, [open])

  if (!open) return null

  const handleCopyLogs = async () => {
    const report = {
      gatewayBase: base,
      health,
      logs,
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  const badgeColor = (status: PlanDebugLog["status"]) => {
    switch (status) {
      case "success":
        return "badge-success"
      case "empty":
        return "badge-warning"
      case "error":
        return "badge-error"
      default:
        return "badge-info"
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clive-ai-debug-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default border-0 bg-black/60"
        onClick={onClose}
        aria-label={t("common.close", "Chiudi")}
      />
      <div
        className="relative z-10 flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-base-100 p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-base-300 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛠️</span>
            <h3 id="clive-ai-debug-title" className="text-lg font-bold">{t("debug.title", "AI Magic Debugger")}</h3>
          </div>
          <button className="tooltip tooltip-left btn btn-ghost btn-xs" onClick={onClose} aria-label={t("common.close")}
              title={t("common.close")}
        data-tip={t("common.close")}>
            ✕
          </button>
        </div>

        {/* Gateway Health Header */}
        <div className="mt-3 rounded-lg border border-base-300 bg-base-200/50 p-3 text-xs flex flex-wrap gap-4 items-center justify-between">
          <div>
            <span className="font-semibold opacity-70">{t("debug.gateway", "Gateway Base")}: </span>
            <code className="text-primary">{base || "resolving..."}</code>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold opacity-70">{t("debug.health", "Status")}: </span>
            {health ? (
              health.ok ? (
                <span className="badge badge-success badge-sm">{t("debug.healthy", "Healthy")}</span>
              ) : (
                <span className="badge badge-error badge-sm">{t("debug.unreachable", "Unreachable")}</span>
              )
            ) : (
              <span className="loading loading-spinner loading-xs" />
            )}
          </div>
        </div>

        {/* Log Entries List */}
        <div className="scroll-area mt-4 flex-1 overflow-y-auto space-y-2">
          {logs.length === 0 ? (
            <div className="py-8 text-center text-sm opacity-60">
              {t("debug.noLogs", "Nessuna chiamata AI Magic registrata finora.")}
            </div>
          ) : (
            logs.map((log) => {
              const isExpanded = expandedId === log.id
              return (
                <div
                  key={log.id}
                  className="rounded-lg border border-base-300 bg-base-100 p-3 text-xs shadow-sm transition-all"
                >
                  <div
                    className="flex cursor-pointer items-center justify-between gap-2"
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`badge ${badgeColor(log.status)} badge-sm uppercase font-mono`}>
                        {log.status}
                      </span>
                      <span className="badge badge-ghost badge-xs">{log.kind === 'chat' ? 'chat' : 'plan'}</span>
                      <span className="truncate font-semibold">{log.model}</span>
                      {log.stage && <span className="badge badge-ghost badge-xs font-mono">{log.stage}</span>}
                      <span className="opacity-50 text-[10px]">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {log.expandedOpsCount !== undefined && (
                        <span className="badge badge-ghost badge-sm font-mono">
                          {log.expandedOpsCount} ops
                        </span>
                      )}
                      {log.apply && (
                        <span className={`badge badge-sm ${log.apply.status === 'success' ? 'badge-success' : log.apply.status === 'error' ? 'badge-error' : 'badge-info'}`}>
                          apply:{log.apply.status} · {log.apply.includedOps}/{log.apply.totalOps}
                        </span>
                      )}
                      <span>{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 space-y-2 border-t border-base-200 pt-2">
                      <div>
                        <div className="font-semibold opacity-70 mb-1">{t("debug.promptText", "Testo Input")}:</div>
                        <div className="max-h-24 overflow-y-auto rounded bg-base-200 p-2 font-mono text-[11px] whitespace-pre-wrap">
                          {log.promptText}
                        </div>
                      </div>

                      <div>
                        <div className="font-semibold opacity-70 mb-1">{t("debug.signature", "Firma Directory")}:</div>
                        <div className="max-h-24 overflow-y-auto rounded bg-base-200 p-2 font-mono text-[11px] whitespace-pre-wrap">
                          {log.signature}
                        </div>
                      </div>

                      {log.errorDetails && (
                        <div>
                          <div className="font-semibold text-error mb-1">{t("debug.errorDetails", "Dettagli Errore")}:</div>
                          <div className="rounded bg-error/10 p-2 text-error font-mono text-[11px]">
                            {log.errorDetails}
                          </div>
                        </div>
                      )}

                      {log.rawResponse && (
                        <div>
                          <div className="font-semibold opacity-70 mb-1">{t("debug.rawResponse", "Risposta Modello (JSON)")}:</div>
                          <pre className="max-h-36 overflow-y-auto rounded bg-base-200 p-2 font-mono text-[10px]">
                            {JSON.stringify(log.rawResponse, null, 2)}
                          </pre>
                        </div>
                      )}

                      {log.apply && (
                        <div>
                          <div className="font-semibold opacity-70 mb-1">{t("debug.applyDetails", "Apply / Undo")}</div>
                          <div className="rounded bg-base-200 p-2 font-mono text-[11px] whitespace-pre-wrap">
                            <div>batch: {log.apply.batchId ?? '-'}</div>
                            <div>ops: {log.apply.includedOps} incluse / {log.apply.excludedOps} escluse</div>
                            <div>tipi: {JSON.stringify(log.apply.opsByKind)}</div>
                            {log.apply.report !== undefined && log.apply.report !== null && typeof log.apply.report === 'object' && 'durationMs' in log.apply.report && <div>durata: {String((log.apply.report as { durationMs?: unknown }).durationMs)} ms</div>}
                            {log.apply.report !== undefined && log.apply.report !== null && typeof log.apply.report === 'object' && 'phaseCounts' in log.apply.report && <div>fasi: {JSON.stringify((log.apply.report as { phaseCounts?: unknown }).phaseCounts)}</div>}
                            {log.apply.report !== undefined && log.apply.report !== null && typeof log.apply.report === 'object' && 'failed' in log.apply.report && <div>fallimenti: {JSON.stringify((log.apply.report as { failed?: unknown }).failed)}</div>}
                            {log.apply.progress && <div>progress: {log.apply.progress.done}/{log.apply.progress.total} · {log.apply.progress.currentId}</div>}
                            {log.apply.errorDetails && <div className="text-error">error: {log.apply.errorDetails}</div>}
                          </div>
                          {log.apply.payload !== undefined && (
                            <pre className="mt-2 max-h-44 overflow-y-auto rounded bg-base-200 p-2 font-mono text-[10px]">
                              {JSON.stringify(log.apply.payload, null, 2)}
                            </pre>
                          )}
                          {log.apply.report !== undefined && (
                            <pre className="mt-2 max-h-32 overflow-y-auto rounded bg-base-200 p-2 font-mono text-[10px]">
                              {JSON.stringify(log.apply.report, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}

                      {log.events && log.events.length > 0 && (
                        <div>
                          <div className="font-semibold opacity-70 mb-1">Trace</div>
                          <div className="max-h-40 overflow-y-auto rounded bg-base-200 p-2 font-mono text-[10px]">
                            {log.events.map((event, index) => (
                              <div key={`${event.at}-${index}`}>
                                {new Date(event.at).toLocaleTimeString()} · {event.stage} · {event.type}
                                {event.durationMs !== undefined ? ` · ${event.durationMs}ms` : ''}
                                {event.detail ? ` · ${event.detail}` : ''}
                                {event.metadata ? ` · ${JSON.stringify(event.metadata)}` : ''}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-4 flex items-center justify-between border-t border-base-300 pt-3">
          <button className="btn btn-ghost btn-xs text-error" onClick={clearLogs} disabled={logs.length === 0}>
            {t("debug.clear", "Pulisci Log")}
          </button>
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={handleCopyLogs} disabled={logs.length === 0}>
              {copied ? t("debug.copied", "Copiato!") : t("debug.copyLogs", "Copia Log Debug")}
            </button>
            <button className="btn btn-primary btn-sm" onClick={onClose}>
              {t("common.close", "Chiudi")}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
