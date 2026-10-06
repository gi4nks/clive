import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export interface PlaceItem {
  label: string
  path: string
  icon: ReactNode
}

interface PlacesProps {
  home: string
  currentPath: string
  recents: string[]
  onNavigate: (path: string) => void
  onClearRecents: () => void
  onItemContextMenu: (kind: 'place' | 'recent', label: string, path: string, x: number, y: number) => void
}

const CLOCK_SVG = (
  <svg viewBox="0 0 24 24" className="h-4 w-4 text-base-content/60" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const DESKTOP_SVG = (
  <svg viewBox="0 0 24 24" className="h-4 w-4 text-base-content/60" fill="currentColor" aria-hidden>
    <path d="M12 3v10M5.5 7.5h13l-1.7 4.3L17 17l-4.3-1.7H5.5l1.7-4.3L3.6 7l4.3 1.7H5.5l-1.7 4.3L1 17l4.3 1.7H5.5z" />
  </svg>
)

const DOCUMENTS_SVG = (
  <svg viewBox="0 0 24 24" className="h-4 w-4 text-base-content/60" fill="currentColor" aria-hidden>
    <path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v14m10-2v-2M4.25 2.2l-.5-.5a1 1 0 0 0-1.41 0L2 6l.8.8 7 7 .8.8-4.1 4.1a1 1 0 0 0 1.42 1.42z" />
  </svg>
)

const DOWNLOADS_SVG = (
  <svg viewBox="0 0 24 24" className="h-4 w-4 text-base-content/60" fill="currentColor" aria-hidden>
    <path d="M21 15v4a2 2 0 0 1-2.15.8L12 21l-6.85-1.04A2 2 0 0 1 3 19v-6a2 2 0 0 1 1.44-1.78L7.15 10H2a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2.08l6.35 1.04a2 2 0 0 1 1.06 1.8z" />
  </svg>
)

const PICTURES_SVG = (
  <svg viewBox="0 0 24 24" className="h-4 w-4 text-base-content/60" fill="currentColor" aria-hidden>
    <path d="M21 15a2 2 0 0 1-2.15.8L12 21l-6.85-1.04A2 2 0 0 1 3 19v-6a2 2 0 0 1 1.44-1.78L7.15 10H2a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2.08l6.35 1.04a2 2 0 0 1 1.06 1.8zM6.84 5.11l.53.07L6 2h.08l.53.07L12 13l6.04-2.06.53.07L17 7l-5.16 2.06.53.07L12 2l-5.16 2.06.53.07L6 2H6.08l-.53-.07z" />
  </svg>
)

const MUSIC_SVG = (
  <svg viewBox="0 0 24 24" className="h-4 w-4 text-base-content/60" fill="currentColor" aria-hidden>
    <path d="M12 2L15 22h-4l-2-10h-4l-2 10H12zM2 12h4l2 6h10l2-6h4z" />
  </svg>
)

function SidebarRow({
  icon,
  label,
  active,
  onClick,
  onContextMenu,
}: {
  icon: ReactNode
  label: string
  active: boolean
  onClick: () => void
  onContextMenu?: (x: number, y: number) => void
}) {
  return (
    <button
      onClick={onClick}
      onContextMenu={
        onContextMenu
          ? (e) => {
              e.preventDefault()
              onContextMenu(e.clientX, e.clientY)
            }
          : undefined
      }
      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-base-200:bg-base-300:text-base-content/60 ${
        active
          ? 'bg-primary/15 text-primary'
          : ''
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-base-content/60">
      {children}
    </div>
  )
}

export function Places({ home, currentPath, recents, onNavigate, onClearRecents, onItemContextMenu }: PlacesProps) {
  const { t } = useTranslation()
  const places: PlaceItem[] = home
    ? [
        { label: t('places.home'), path: home, icon: DESKTOP_SVG },
        { label: t('places.desktop'), path: `${home}/Desktop`, icon: DESKTOP_SVG },
        { label: t('places.documents'), path: `${home}/Documents`, icon: DOCUMENTS_SVG },
        { label: t('places.downloads'), path: `${home}/Downloads`, icon: DOWNLOADS_SVG },
        { label: t('places.pictures'), path: `${home}/Pictures`, icon: PICTURES_SVG },
        { label: t('places.music'), path: `${home}/Music`, icon: MUSIC_SVG },
      ]
    : []

  const activePlace = places.find((p) => currentPath === p.path)

  return (
    <aside className="scroll-area flex h-full min-h-0 flex-col p-2">
      <SectionLabel>{t('places.title')}</SectionLabel>
      {places.map((p) => (
        <SidebarRow
          key={p.path}
          icon={p.icon}
          label={p.label}
          active={currentPath === p.path}
          onClick={() => onNavigate(p.path)}
          onContextMenu={(x, y) => onItemContextMenu('place', p.label, p.path, x, y)}
        />
      ))}

      {recents.length > 0 && (
        <>
          <SectionLabel>{t('places.recents')}</SectionLabel>
          {recents.map((p) => (
            <SidebarRow
              key={p}
              icon={CLOCK_SVG}
              label={p}
              active={!activePlace && currentPath === p}
              onClick={() => onNavigate(p)}
              onContextMenu={(x, y) => onItemContextMenu('recent', p.split('/').pop() || p, p, x, y)}
            />
          ))}
          <button
            onClick={onClearRecents}
            className="mx-2 mt-2 self-start rounded px-2 py-1 text-[10px] text-base-content/60 transition-colors hover:bg-base-300 hover:text-base-content/60:bg-base-300:text-base-content/60"
          >
            {t('places.clearRecents')}
          </button>
        </>
      )}

      {recents.length === 0 && (
        <div className="px-2 pt-1 text-[10px] text-base-content/60">{t('places.none')}</div>
      )}
    </aside>
  )
}