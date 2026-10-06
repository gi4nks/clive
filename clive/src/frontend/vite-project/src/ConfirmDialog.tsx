import { useTranslation } from 'react-i18next'
import { answerConfirm, useConfirmRequest } from './confirm'

/** Hosted once in App; renders the pending confirmAsk() request. */
export function ConfirmDialog() {
  const { req } = useConfirmRequest()
  const { t } = useTranslation()
  if (!req) return null
  return (
    <div className="modal modal-open z-[95]" role="alertdialog" aria-modal="true" aria-label={req.title} data-confirm-dialog>
      <div className="modal-box max-w-sm rounded-2xl p-0 shadow-2xl">
        <div className="px-5 pt-4 text-sm font-semibold">{req.title}</div>
        <p className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words px-5 py-3 text-sm opacity-80">{req.message}</p>
        <div className="flex justify-end gap-2 border-t border-base-300 px-5 py-3">
          <button data-bar-control className="btn btn-sm btn-ghost" autoFocus onClick={() => answerConfirm(false)}>
            {t('common.cancel')}
          </button>
          <button data-bar-control className={`btn btn-sm ${req.danger ? 'btn-error' : 'btn-primary'}`} onClick={() => answerConfirm(true)}>
            {req.acceptLabel}
          </button>
        </div>
      </div>
      <div className="modal-backdrop bg-black/40" onClick={() => answerConfirm(false)} />
    </div>
  )
}
