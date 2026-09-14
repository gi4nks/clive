import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { checkHealth, listAvailableModels, type AiHealth, type ModelOption } from '../ai/runtime'
import { aiAddProvider, aiRemoveProvider, aiSetProvider, buildInfo, type BuildInfo } from '../api'
import { providerLabel, refreshProviders, useProviderRegistry, type GatewayProvider } from '../ai/settings'
import { DEFAULT_CONFIG, exportConfig, importConfig, resetConfig, useAppConfig, type Language, type RemoteLocation } from './appConfig'
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

/** AI tab: provider master-detail (list left, settings of the selected one right). */
function AiTab({ health, models, onChanged }: { health: AiHealth | null; models: ModelOption[]; onChanged: () => void }) {
  const { t } = useTranslation()
  const [cfg, set] = useAppConfig()
  const registry = useProviderRegistry()
  const selectable = cfg.ai.cloudOptIn ? registry : registry.filter((p) => !p.cloud)
  const [sel, setSel] = useState<string>('')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<{ base: string; key: string } | null>(null)
  const [add, setAdd] = useState({ id: '', base: '', key: '' })
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  const shown = (sel && selectable.find((p) => p.id === sel)) || selectable.find((p) => p.id === cfg.ai.provider) || selectable[0] || null
  const dot = (id: string) => (health ? (health.providers?.[id] ? 'bg-success' : 'bg-error') : 'bg-base-content/25')

  const openProvider = (id: string) => {
    setSel(id)
    setAdding(false)
    setDraft(null)
    setMsg('')
  }
  const base = (p: GatewayProvider) => (draft && sel === p.id ? draft.base : p.baseUrl)
  const key = (p: GatewayProvider) => (draft && sel === p.id ? draft.key : '')

  const save = async (id: string) => {
    setSaving(true)
    setMsg('')
    try {
      const d = draft ?? { base: '', key: '' }
      await aiSetProvider(id, d.base.trim() || undefined, d.key.trim() || undefined)
      setDraft(null)
      onChanged()
      setMsg(t('settings.aiSaved'))
    } catch (e) {
      setMsg(String(e))
    } finally {
      setSaving(false)
    }
  }

  const applyDefault = (id: string) => {
    const first = models.find((m) => m.provider === id)
    set({ ai: { provider: id, model: first?.id ?? '' } })
    onChanged()
  }

  const remove = async (id: string) => {
    if (!window.confirm(t('settings.aiRemoveConfirm', { id }))) return
    try {
      await aiRemoveProvider(id)
      setSel('')
      onChanged()
    } catch (e) {
      setMsg(String(e))
    }
  }

  const addProvider = async () => {
    setSaving(true)
    setMsg('')
    try {
      await aiAddProvider(add.id.trim().toLowerCase(), add.base.trim(), add.key.trim() || undefined)
      setAdd({ id: '', base: '', key: '' })
      setAdding(false)
      onChanged()
      setMsg(t('settings.aiSaved'))
    } catch (e) {
      setMsg(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3">
        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto pr-1">
          {selectable.map((p) => (
            <button
              key={p.id}
              className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm ${!adding && p.id === shown?.id ? 'border-primary/60 bg-primary/10' : 'border-transparent hover:bg-base-200'}`}
              onClick={() => openProvider(p.id)}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${dot(p.id)}`} />
              <span className="min-w-0 flex-1 truncate">{providerLabel(p.id)}</span>
              {p.cloud && <span aria-hidden className="shrink-0 text-[10px] text-warning">☁</span>}
              {!p.builtin && <span className="shrink-0 text-[10px] opacity-50">{t('settings.aiCustom')}</span>}
              {p.id === cfg.ai.provider && <span className="shrink-0 text-[10px] font-semibold text-primary">●</span>}
            </button>
          ))}
          <button className={`btn btn-sm btn-outline mt-1 ${adding ? 'btn-active' : ''}`} onClick={() => { setAdding(true); setSel(''); setMsg('') }}>
            ＋ {t('settings.aiAdd')}
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto rounded-lg border border-base-300 p-3 text-sm">
          {adding && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-60">{t('settings.aiAdd')}</div>
              <input className="input input-sm input-bordered w-full font-mono" placeholder="openrouter" value={add.id} onChange={(e) => setAdd((s) => ({ ...s, id: e.target.value.toLowerCase() }))} />
              <input className="input input-sm input-bordered w-full font-mono" placeholder="https://openrouter.ai/api/v1" value={add.base} onChange={(e) => setAdd((s) => ({ ...s, base: e.target.value }))} />
              <input type="password" className="input input-sm input-bordered w-full" placeholder={t('settings.aiAddKeyPlaceholder')} value={add.key} onChange={(e) => setAdd((s) => ({ ...s, key: e.target.value }))} />
              <button className="btn btn-sm btn-primary" disabled={saving || !add.id.trim() || !add.base.trim()} onClick={() => void addProvider()}>
                {t('settings.aiAdd')}
              </button>
            </div>
          )}
          {!adding && !shown && <div className="text-xs text-base-content/60">{t('settings.aiDetailHint')}</div>}
          {!adding && shown && (
            <div className="space-y-2" data-testid="ai-provider-detail">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-semibold">{providerLabel(shown.id)}</span>
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot(shown.id)}`} />
              </div>
              <div className="truncate font-mono text-[11px] text-base-content/50" title={shown.device}>{shown.device}</div>
              <label className="block text-[11px] uppercase tracking-wide opacity-60">{t('settings.aiBaseUrl')}</label>
              <input
                className="input input-sm input-bordered w-full font-mono text-xs"
                value={base(shown)}
                onChange={(e) => setDraft({ base: e.target.value, key: key(shown) })}
              />
              <label className="block text-[11px] uppercase tracking-wide opacity-60">{shown.hasKey ? `${t('common.key')}: ${shown.keyPreview}` : t('settings.aiNoKey')}</label>
              <div className="flex gap-1">
                <input
                  type="password"
                  className="input input-sm input-bordered min-w-0 flex-1"
                  placeholder={shown.hasKey ? t('settings.aiKeyReplace') : 'sk-…'}
                  value={key(shown)}
                  onChange={(e) => setDraft({ base: base(shown), key: e.target.value })}
                />
                <button className="btn btn-sm btn-primary shrink-0" disabled={saving} onClick={() => void save(shown.id)}>{t('settings.aiSave')}</button>
              </div>
              <div className="text-[11px] opacity-60">
                {t('settings.defaultModel')}: {shown.id === cfg.ai.provider ? (models.find((m) => m.id === cfg.ai.model)?.name ?? cfg.ai.model) || '—' : models.find((m) => m.provider === shown.id)?.name ?? '—'}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button className="btn btn-sm btn-outline" disabled={shown.id === cfg.ai.provider} onClick={() => applyDefault(shown.id)}>
                  {t('settings.aiUseDefault')}
                </button>
                {!shown.builtin && (
                  <button className="btn btn-sm btn-error btn-outline" onClick={() => void remove(shown.id)}>
                    {t('settings.aiRemove')}
                  </button>
                )}
              </div>
              {shown.cloud && <p className="rounded-lg border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px] text-warning">{t('ai.cloudWarn')}</p>}
              {msg && <p className="text-xs opacity-70">{msg}</p>}
            </div>
          )}
          {(adding || !shown) && msg && <p className="pt-2 text-xs opacity-70">{msg}</p>}
        </div>
      </div>
      <Row label={t('settings.allowCloud')}>
        <input type="checkbox" className="toggle toggle-sm" checked={cfg.ai.cloudOptIn} onChange={(e) => set({ ai: { cloudOptIn: e.target.checked } })} />
      </Row>
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
  const [remoteName, setRemoteName] = useState('')
  const [remotePath, setRemotePath] = useState('')
  const [remoteKind, setRemoteKind] = useState<RemoteLocation['kind']>('local-sync')
  const [remoteEndpoint, setRemoteEndpoint] = useState('')

  useEffect(() => {
    if (!open) return
    void refreshProviders().catch(() => undefined)
    void checkHealth().then(setHealth)
    listAvailableModels().then(setModels).catch(() => undefined)
    buildInfo().then(setBuild).catch(() => setBuild(null))
  }, [open, aiReload])

  if (!open) return

  const setLang = (language: Language) => {
    set({ language })
    void i18n.changeLanguage(language)
  }
  const addRemoteLocation = () => {
    const name = remoteName.trim()
    const path = remotePath.trim()
    if (!name || !path) return
    if (remoteKind === 'smb' && !remoteEndpoint.trim().startsWith('smb://')) return
    if (cfg.remoteLocations.some((r) => r.path === path)) return
    const remote: RemoteLocation = { id: `remote-${Date.now().toString(36)}`, name, path, kind: remoteKind, ...(remoteKind === 'smb' ? { endpoint: remoteEndpoint.trim() } : {}) }
    set({ remoteLocations: [...cfg.remoteLocations, remote] })
    setRemoteName('')
    setRemotePath('')
    setRemoteEndpoint('')
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
      <div className="modal-box flex h-[34rem] w-full max-w-2xl flex-col rounded-2xl p-0 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-base-300 px-5 py-3">
          <h3 className="text-base font-semibold">{t('settings.title')}</h3>
          <button className="tooltip tooltip-bottom btn btn-ghost btn-sm btn-circle" onClick={onClose} aria-label={t('common.close')}
              title={t('common.close')}
        data-tip={t('common.close')}>✕</button>
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
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
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
              <Row label={t('settings.previewPanel')}>
                <input type="checkbox" className="toggle toggle-sm" checked={cfg.previewPanel} onChange={(e) => set({ previewPanel: e.target.checked })} />
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
              <div className="pt-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">{t('settings.remoteLocations')}</div>
                <p className="mb-3 text-xs text-base-content/60">{t('settings.remoteLocationsHint')}</p>
                <div className="space-y-2">
                  {cfg.remoteLocations.map((remote) => (
                    <div key={remote.id} className="flex items-center gap-2 rounded-lg border border-base-300 px-3 py-2">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-success" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{remote.name}</div>
                        <div className="truncate text-xs text-base-content/60">{remote.path}</div>
                        {remote.kind === 'smb' && <div className="truncate text-[11px] text-base-content/50">{remote.endpoint}</div>}
                      </div>
                      <button className="btn btn-ghost btn-xs" onClick={() => set({ remoteLocations: cfg.remoteLocations.filter((r) => r.id !== remote.id) })}>
                        {t('settings.removeRemote')}
                      </button>
                    </div>
                  ))}
                  <div className="grid gap-2 sm:grid-cols-[9rem_1fr_1.4fr_auto]">
                    <input className="input input-sm input-bordered" value={remoteName} placeholder={t('settings.remoteNamePlaceholder')} onChange={(e) => setRemoteName(e.target.value)} />
                    <select className="select select-sm select-bordered" value={remoteKind} onChange={(e) => setRemoteKind(e.target.value as RemoteLocation['kind'])}>
                      <option value="local-sync">{t('settings.remoteLocalSync')}</option>
                      <option value="smb">{t('settings.remoteSmb')}</option>
                    </select>
                    <input className="input input-sm input-bordered" value={remotePath} placeholder={t('settings.remotePathPlaceholder')} onChange={(e) => setRemotePath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addRemoteLocation()} />
                    <button className="btn btn-sm btn-outline" disabled={!remoteName.trim() || !remotePath.trim() || (remoteKind === 'smb' && !remoteEndpoint.trim())} onClick={addRemoteLocation}>{t('settings.addRemote')}</button>
                  </div>
                  {remoteKind === 'smb' && <input className="input input-sm input-bordered w-full" value={remoteEndpoint} placeholder={t('settings.remoteSmbPlaceholder')} onChange={(e) => setRemoteEndpoint(e.target.value)} />}
                </div>
              </div>
            </div>
          )}

          {tab === 'ai' && (
            <AiTab health={health} models={models} onChanged={() => setAiReload((n) => n + 1)} />
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
