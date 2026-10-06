import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fileInfo, formatDate, formatSize, kindOf, type FileInfo } from './api'

export function FileInfoModal({ path, onClose }: { path: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [info, setInfo] = useState<FileInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void fileInfo(path).then((value) => {
      if (active) setInfo(value)
    }).catch((reason: unknown) => {
      if (active) setError(String(reason))
    })
    return () => { active = false }
  }, [path])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const row = (label: string, value: string) => (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-b border-base-300 py-2 last:border-0">
      <dt className="text-base-content/60">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  )

  return (
    <div className="modal modal-open z-[80]" role="presentation" onMouseDown={onClose}>
      <section className="modal-box max-w-lg" role="dialog" aria-modal="true" aria-labelledby="file-info-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="file-info-title" className="mb-4 text-base font-semibold">{t('fileInfo.title')}</h2>
        {error ? <p role="alert" className="alert alert-error text-sm">{t('fileInfo.error')}: {error}</p> : null}
        {!info && !error ? <p role="status" className="py-6 text-center text-sm opacity-60">{t('common.loading')}</p> : null}
        {info ? (
          <dl className="max-h-[60vh] overflow-auto text-sm">
            {row(t('fileInfo.name'), info.name)}
            {row(t('fileInfo.kind'), kindOf({ ...info, size: info.size ?? 0, extension: info.name.includes('.') ? info.name.split('.').pop() ?? null : null }))}
            {row(t('fileInfo.location'), info.path)}
            {row(t('fileInfo.size'), info.size === null ? t('fileInfo.unavailable') : formatSize(info.size))}
            {info.isDir ? row(t('fileInfo.items'), info.childCount === null ? t('fileInfo.unavailable') : t('count.elements', { count: info.childCount })) : null}
            {row(t('fileInfo.modified'), formatDate(info.modified))}
            {row(t('fileInfo.created'), info.created === null ? t('fileInfo.unavailable') : formatDate(info.created))}
            {row(t('fileInfo.permissions'), info.permissions)}
          </dl>
        ) : null}
        <div className="modal-action">
          <button className="btn btn-sm" onClick={onClose}>{t('common.close')}</button>
        </div>
      </section>
    </div>
  )
}
