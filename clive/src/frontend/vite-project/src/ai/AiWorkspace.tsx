import type { AiController } from './useAi.js'
import type { ChatController } from './useChat.js'
import { AiOverlay } from './AiOverlay.js'
import { ChatDrawer, type ChatDrawerProps } from './ChatDrawer.js'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import type { LocationDescriptor } from '../location.js'

export interface AiWorkspaceProps extends Omit<ChatDrawerProps, 'open' | 'embedded' | 'onClose' | 'ai'> {
  ai: AiController
  chat: ChatController
  chatOpen: boolean
  onChatClose: () => void
  onChatOpen: () => void
  onPlanOpen: () => void
  currentPath: string
  location: LocationDescriptor
  selectedCount: number
  planOpen: boolean
}

/**
 * One visual destination for conversational and quick AI work.
 * High-risk plans remain a separate review surface above this workspace.
 */
export function AiWorkspace({ ai, chat, chatOpen, onChatClose, onChatOpen, onPlanOpen, currentPath, location, selectedCount, planOpen, ...chatProps }: AiWorkspaceProps) {
  const { t } = useTranslation()
  const actionOpen = !!ai.busy || ai.hasPreview || !!ai.journal || !!ai.error
  const [view, setView] = useState<'chat' | 'actions'>(chatOpen ? 'chat' : 'actions')
  const activeView = chatOpen ? 'chat' : view

  if (!chatOpen && !actionOpen) return null

  const close = () => {
    if (activeView === 'chat') onChatClose()
    else if (ai.busy) ai.abort()
    else ai.cancel()
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={close} aria-hidden />
      <aside className="relative z-10 flex h-full w-[420px] max-w-full flex-col border-l border-base-300 bg-base-100 shadow-2xl">
        <header className="border-b border-base-300 bg-base-100 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">{t('ai.workspaceTitle')}</h2>
              <div className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-base-content/55">
                <span className="shrink-0">{t('chat.workspace.context')}:</span>
                <span className="truncate" title={currentPath}>{currentPath}</span>
                {location.kind === 'network' && <span className="shrink-0 text-warning">· {t('chat.workspace.network')}</span>}
                {selectedCount > 0 && <span className="shrink-0">· {t('chat.workspace.selected', { count: selectedCount })}</span>}
              </div>
            </div>
            <button className="tooltip tooltip-left btn btn-ghost btn-xs" onClick={close} title={t('common.close')} data-tip={t('common.close')} aria-label={t('common.close')}>✕</button>
          </div>
          <nav className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-base-200 p-1" aria-label={t('ai.workspaceTitle')}>
            <button className={`btn btn-xs ${activeView === 'chat' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setView('chat'); onChatOpen() }}>{t('chat.workspace.chat')}</button>
            <button className={`btn btn-xs ${activeView === 'actions' && actionOpen ? 'btn-primary' : 'btn-ghost'}`} disabled={!actionOpen} onClick={() => { setView('actions'); onChatClose() }}>{t('chat.workspace.actions')}</button>
            <button className={`btn btn-xs ${planOpen ? 'btn-secondary' : 'btn-ghost'}`} disabled={!planOpen} onClick={onPlanOpen}>{t('chat.workspace.plan')}</button>
          </nav>
        </header>
        <div className="min-h-0 flex-1">
        {activeView === 'chat' ? (
          <ChatDrawer {...chatProps} open embedded showHeader={false} onClose={onChatClose} ai={chat} />
        ) : (
          <AiOverlay ai={ai} embedded showHeader={false} />
        )}
        </div>
      </aside>
    </div>
  )
}
