import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { checkHealth, listAvailableModels, type AiHealth, type ModelOption } from '../ai/runtime'
import { aiGetConfig, aiSetProvider, buildInfo, type AiProviderInfo, type BuildInfo } from '../api'
import { isCloudProvider, visibleProviders } from '../ai/settings'
import { DEFAULT_CONFIG, exportConfig, importConfig, resetConfig, useAppConfig, type Language } from './appConfig'
import { clampWidth } from '../resize'
import i18n from '../i18n'

const THEMES = ['', 'light', 'dark', 'dracula', 'business', 'night', 'cupcake']

type Tab = 'general' | 'file' | 'ai' | 'advanced'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  )
}

/** Provider base-URL / API-key editor, persisted to `~/.clive/ai.env`. */
function ProviderKeys({ onSaved }: { onSaved: () => void }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<AiProviderInfo[]>([])
  const [draft, setDraft] = useState<Record<string, { base: string; key: string }>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const load = () => aiGetConfig().then((r) => {
    setRows(r)
    setDraft(Object.fromEntries(r.map((p) => [p.id, { base: p.baseUrl, key: '' }])))
  }).catch(() => undefined)
  useEffect(() => { void load() }, [])

  const label = (id: string) => visibleProviders().find((p) => p.id === id)?.label ?? id

  const save = async (id: string) => {
    setSaving(true); setMsg('')
    try {
      const d = draft[id] ?? { base: '', key: '' }
      await aiSetProvider(id, d.base.trim() || undefined, d.key.trim() || undefined)
      await load()
      onSaved()
      setMsg(t('settings.aiSaved'))
    } catch (e) {
      setMsg(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 py-2">
      <p className="text-xs text-base-content/60">{t('settings.aiKeysHint')}</p>
      {rows.map((p) => {
        const d = draft[p.id] ?? { base: '', key: '' }
        return (
          <div key={p.id} className="rounded-lg border border-base-300 p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold">{label(p.id)}</span>
              <span className={`badge badge-xs ${p.hasKey ? 'badge-success' : 'badge-ghost'}`}>
                {p.hasKey ? p.keyPreview : t('settings.aiNoKey')}
              </span>
            </div>
            <input
              className="input input-sm input-bordered mb-1 w-full font-mono text-xs"
              value={d.base}
              placeholder="https://…/v1"
              onChange={(e) => setDraft((s) => ({ ...s, [p.id]: { ...d, base: e.target.value } }))}
            />
            <div className="flex gap-1">
              <input
                type="password"
                className="input input-sm input-bordered min-w-0 flex-1"
                value={d.key}
                placeholder={p.hasKey ? t('settings.aiKeyReplace') : 'sk-…'}
                onChange={(e) => setDraft((s) => ({ ...s, [p.id]: { ...d, key: e.target.value } }))}
              />
              <button className="btn btn-sm btn-primary shrink-0" disabled={saving} onClick={() => void save(p.id)}>
                {t('settings.aiSave')}
              </button>
            </div>
          </div>
        )
      })}
      {msg && <p className="text-xs text-success">{msg}</p>}
    </div>
  )
}

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [cfg, set] = useAppConfig()
  const [tab, setTab] = useState<Tab>('general')
  const [health, setHealth] = useState<AiHealth | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [importMsg, setImportMsg] = useState('')
  const [aiReload, setAiReload] = useState(0)
  // undefined = loading; null = backend has no build_info (stale instance); else fresh.
  const [build, setBuild] = useState<BuildInfo | null | undefined>(undefined)

  useEffect(() => {
    if (!open) return
    void checkHealth().then(setHealth)
    listAvailableModels().then(setModels).catch(() => undefined)
    buildInfo().then(setBuild).catch(() => setBuild(null))
  }, [open, aiReload])

  if (!open) return null

  const providerModels = models.filter((m) => m.provider === cfg.ai.provider)

  const setLang = (language: Language) => {
    set({ language })
    void i18n.changeLanguage(language)
  }
  const setProvider = (provider: string) => {
    const first = models.find((m) => m.provider === provider)
    set({ ai: { provider, model: first?.id ?? cfg.ai.model } })
  }

  const doExport = () => {
    const blob = new Blob([exportConfig()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'clive-settings.json'
    a.click()
    URL.revokeObjectURL(url)
  }
  const doImport = async (file: File) => {
    const r = importConfig(await file.text())
    setImportMsg(r.ok ? t('settings.importedOk') : t('settings.importedBad'))
  }

  return (
    <div className="modal modal-open">
      <div className="modal-box w-full max-w-lg rounded-2xl p-0 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-base-300 px-5 py-3">
          <h3 className="text-base font-semibold">{t('settings.title')}</h3>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-3">
          <div role="tablist" className="tabs tabs-boxed w-full text-sm">
            {(['general', 'file', 'ai', 'advanced'] as const).map((id) => (
              <button key={id} role="tab" className={`tab grow ${tab === id ? 'tab-active' : ''}`} onClick={() => setTab(id)}>
                {t(`settings.${id}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-5 py-2">
          {tab === 'general' && (
            <div className="divide-y divide-base-300">
              <Row label={t('settings.language')}>
                <select className="select select-sm select-bordered w-36" value={cfg.language} onChange={(e) => setLang(e.target.value as Language)}>
                  <option value="en">English</option>
                  <option value="it">Italiano</option>
                </select>
              </Row>
              <Row label={t('settings.theme')}>
                <select className="select select-sm select-bordered w-36" value={cfg.theme} onChange={(e) => set({ theme: e.target.value })}>
                  {THEMES.map((v) => (
                    <option key={v || 'system'} value={v}>{v ? v : t('settings.followSystem')}</option>
                  ))}
                </select>
              </Row>
            </div>
          )}

          {tab === 'file' && (
            <div className="divide-y divide-base-300">
              <Row label={t('settings.defaultView')}>
                <select className="select select-sm select-bordered w-36" value={cfg.view} onChange={(e) => set({ view: e.target.value as 'list' | 'grid' })}>
                  <option value="list">{t('settings.viewList')}</option>
                  <option value="grid">{t('settings.viewGrid')}</option>
                </select>
              </Row>
              <Row label={t('settings.sortBy')}>
                <select className="select select-sm select-bordered w-36" value={cfg.sort.key} onChange={(e) => set({ sort: { ...cfg.sort, key: e.target.value as typeof cfg.sort.key } })}>
                  <option value="name">{t('settings.name')}</option>
                  <option value="size">{t('settings.size')}</option>
                  <option value="modified">{t('settings.date')}</option>
                </select>
              </Row>
              <Row label={t('settings.showHidden')}>
                <input type="checkbox" className="toggle toggle-sm" checked={cfg.hiddenVisible} onChange={(e) => set({ hiddenVisible: e.target.checked })} />
              </Row>
              <Row label={t('settings.confirmDestructive')}>
                <input type="checkbox" className="toggle toggle-sm" checked={cfg.confirmDestructive} onChange={(e) => set({ confirmDestructive: e.target.checked })} />
              </Row>
              <Row label={t('settings.guardSystem')}>
                <input
                  type="checkbox"
                  className="toggle toggle-sm"
                  checked={cfg.guardSystemLocations}
                  onChange={(e) => {
                    if (!e.target.checked && !window.confirm(t('settings.guardSystemOffConfirm'))) return
                    set({ guardSystemLocations: e.target.checked })
                  }}
                />
              </Row>
            </div>
          )}

          {tab === 'ai' && (
            <div className="divide-y divide-base-300">
              <Row label={t('settings.gateway')}>
                <span className={`badge badge-sm ${health?.ok ? 'badge-success' : health ? 'badge-error' : 'badge-ghost'}`}>
                  {health?.ok ? t('ai.online') : health ? t('ai.offline') : '…'}
                </span>
              </Row>
              <Row label={t('settings.defaultProvider')}>
                <select className="select select-sm select-bordered w-40" value={cfg.ai.provider} onChange={(e) => setProvider(e.target.value)}>
                  {visibleProviders().map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </Row>
              <Row label={t('settings.defaultModel')}>
                <select className="select select-sm select-bordered w-40" value={cfg.ai.model} onChange={(e) => set({ ai: { model: e.target.value } })}>
                  {(providerModels.length ? providerModels : [{ id: cfg.ai.model, name: cfg.ai.model, provider: cfg.ai.provider }]).map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </Row>
              <Row label={t('settings.allowCloud')}>
                <input type="checkbox" className="toggle toggle-sm" checked={cfg.ai.cloudOptIn} onChange={(e) => set({ ai: { cloudOptIn: e.target.checked } })} />
              </Row>
              {isCloudProvider(cfg.ai.provider) && (
                <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">{t('ai.cloudWarn')}</p>
              )}
              <div className="pt-1">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">{t('settings.aiProviders')}</div>
                <ProviderKeys onSaved={() => setAiReload((n) => n + 1)} />
              </div>
            </div>
          )}

          {tab === 'advanced' && (
            <div className="divide-y divide-base-300">
              <Row label={t('settings.sidebarWidth')}>
                <input type="number" min={160} max={560} className="input input-sm input-bordered w-24" value={cfg.sidebarWidth} onChange={(e) => set({ sidebarWidth: clampWidth(Number(e.target.value)) })} />
              </Row>
              <div className="flex flex-wrap items-center gap-2 py-3">
                <button className="btn btn-sm" onClick={doExport}>{t('settings.export')}</button>
                <label className="btn btn-sm btn-outline">
                  {t('settings.import')}
                  <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void doImport(e.target.files[0])} />
                </label>
                <button className="btn btn-sm btn-error btn-outline" onClick={() => window.confirm(t('settings.resetConfirm')) && (resetConfig(), set({ ...DEFAULT_CONFIG }))}>
                  {t('settings.reset')}
                </button>
              </div>
              {importMsg && <p className="py-1 text-xs opacity-70">{importMsg}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-base-300 px-5 py-3">
          <span className={`text-[11px] ${build === null ? 'text-warning' : 'opacity-50'}`} title={t('settings.buildHint')}>
            {build === undefined && '…'}
            {build === null && `${t('settings.build')}: ${t('settings.buildUnknown')}`}
            {build && `v${build.version} · ${t('settings.build')} ${build.buildEpoch ? new Date(build.buildEpoch * 1000).toLocaleString() : '?'}`}
          </span>
          <button className="btn btn-sm btn-primary" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
      <div className="modal-backdrop bg-black/40" onClick={onClose} />
    </div>
  )
}
