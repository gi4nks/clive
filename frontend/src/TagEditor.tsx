import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getFileTags, setFilesTags, type FileTag } from './api'

const COLORS = [
  { value: 1, css: '#8e8e93' }, { value: 2, css: '#34c759' }, { value: 3, css: '#af52de' },
  { value: 4, css: '#007aff' }, { value: 5, css: '#ffcc00' }, { value: 6, css: '#ff3b30' }, { value: 7, css: '#ff9500' },
]

export function TagDot({ color }: { color: number }) {
  const css = COLORS.find((c) => c.value === color)?.css ?? '#8e8e93'
  return <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: css }} />
}

export function TagEditor({ paths, onClose, onApplied }: { paths: string[]; onClose: () => void; onApplied: () => void }) {
  const { t } = useTranslation()
  const [byPath, setByPath] = useState<Record<string, FileTag[]>>({})
  const [name, setName] = useState('')
  const [color, setColor] = useState(6)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    void getFileTags(paths).then((rows) => {
      if (live) setByPath(Object.fromEntries(rows))
    }).catch((e: unknown) => live && setError(String(e)))
    return () => { live = false }
  }, [paths])

  const tags = useMemo(() => {
    const merged = new Map<string, FileTag>()
    Object.values(byPath).flat().forEach((tag) => { if (!merged.has(tag.name.toLocaleLowerCase())) merged.set(tag.name.toLocaleLowerCase(), tag) })
    return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [byPath])

  const toggleTag = (tag: FileTag, checked: boolean) => setByPath((current) => Object.fromEntries(paths.map((path) => {
    const own = current[path] ?? []
    const next = own.filter((t) => t.name.toLocaleLowerCase() !== tag.name.toLocaleLowerCase())
    if (checked) next.push(tag)
    return [path, next]
  })))

  const addTag = () => {
    const label = name.trim()
    if (!label) return
    if (/[\r\n]/.test(label)) { setError(t('tags.invalid')); return }
    setError('')
    toggleTag({ name: label, color }, true)
    setName('')
  }

  const apply = async () => {
    setBusy(true)
    setError('')
    try {
      await setFilesTags(paths.map((path) => ({ path, tags: byPath[path] ?? [] })))
      onApplied()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal modal-open z-[92]" role="dialog" aria-modal="true" aria-label={t('tags.title')}>
      <div className="modal-box w-full max-w-md rounded-2xl p-0 shadow-2xl">
        <div className="border-b border-base-300 px-5 py-3">
          <h2 className="font-semibold">{t('tags.title')}</h2>
          <p className="text-xs opacity-60">{t('tags.items', { count: paths.length })}</p>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex gap-2">
            <input className="input input-sm input-bordered min-w-0 flex-1" value={name} placeholder={t('tags.newPlaceholder')} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag()} autoFocus />
            <button className="btn btn-sm btn-primary" onClick={addTag}>{t('tags.add')}</button>
          </div>
          <div className="flex items-center gap-1.5" aria-label={t('tags.color')}>
            {COLORS.map((c) => <button key={c.value} type="button" aria-label={t(`tags.colors.${c.value}`)} aria-pressed={color === c.value} className={`rounded-full p-1 ${color === c.value ? 'ring-2 ring-primary ring-offset-1 ring-offset-base-100' : ''}`} onClick={() => setColor(c.value)}><TagDot color={c.value} /></button>)}
          </div>
          <div className="max-h-52 overflow-y-auto rounded-lg border border-base-300">
            {tags.length ? tags.map((tag) => {
              const presentCount = paths.filter((path) => (byPath[path] ?? []).some((x) => x.name.toLocaleLowerCase() === tag.name.toLocaleLowerCase())).length
              return <label key={tag.name.toLocaleLowerCase()} className="flex cursor-pointer items-center gap-2 border-b border-base-300/60 px-3 py-2 last:border-0">
                <input type="checkbox" className="checkbox checkbox-sm" checked={presentCount === paths.length} ref={(el) => { if (el) el.indeterminate = presentCount > 0 && presentCount < paths.length }} onChange={(e) => toggleTag(tag, e.target.checked)} />
                <TagDot color={tag.color} /><span className="min-w-0 flex-1 truncate">{tag.name}</span>
                {presentCount > 0 && presentCount < paths.length && <span className="text-xs opacity-50">{presentCount}/{paths.length}</span>}
              </label>
            }) : <p className="px-3 py-4 text-center text-sm opacity-50">{t('tags.empty')}</p>}
          </div>
          {error && <p role="alert" className="text-sm text-error">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-base-300 px-5 py-3">
          <button className="btn btn-sm btn-ghost" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button className="btn btn-sm btn-primary" onClick={() => void apply()} disabled={busy}>{busy ? t('common.loading') : t('tags.apply')}</button>
        </div>
      </div>
      <button className="modal-backdrop" aria-label={t('common.close')} onClick={onClose} />
    </div>
  )
}
