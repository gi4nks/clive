import type { ReactNode } from 'react'

export type UiIconName =
  | 'home'
  | 'desktop'
  | 'documents'
  | 'downloads'
  | 'pictures'
  | 'music'
  | 'movies'
  | 'folder'
  | 'file'
  | 'pin'
  | 'clock'
  | 'internalDisk'
  | 'externalDisk'
  | 'networkGlobe'
  | 'cloud'
  | 'eject'
  | 'disconnect'
  | 'chevronRight'
  | 'chevronLeft'
  | 'chevronDown'
  | 'chevronUp'
  | 'sortAsc'
  | 'sortDesc'
  | 'plus'
  | 'close'
  | 'moreHorizontal'
  | 'chatBubble'
  | 'wand'
  | 'sparkles'
  | 'renameAction'
  | 'organizeAction'
  | 'newFolderAction'
  | 'trashAction'
  | 'warning'
  | 'wrench'
  | 'scissors'
  | 'copy'
  | 'check'

const PATHS: Record<UiIconName, ReactNode> = {
  home: (
    <>
      <path d="M3 8.2 8 3.8l5 4.4" />
      <path d="M4.5 7.2v5.3a.8.8 0 0 0 .8.8h5.4a.8.8 0 0 0 .8-.8V7.2" />
    </>
  ),
  desktop: (
    <>
      <rect x="2.3" y="3.2" width="11.4" height="7.6" rx="1.3" />
      <path d="M8 10.8v2.2M5.5 13h5" />
    </>
  ),
  documents: (
    <>
      <path d="M4.2 2.4h5.1l2.5 2.5v7.9a.9.9 0 0 1-.9.9H4.2a.9.9 0 0 1-.9-.9V3.3a.9.9 0 0 1 .9-.9Z" />
      <path d="M9.1 2.5V5h2.5M5.5 7.6h5M5.5 9.8h5M5.5 11.8h3.2" />
    </>
  ),
  downloads: (
    <>
      <circle cx="8" cy="8" r="5.7" />
      <path d="M8 5.1v5.3m-2.1-2 2.1 2.2 2.1-2.2M5.7 11.7h4.6" />
    </>
  ),
  pictures: (
    <>
      <rect x="2.5" y="3.2" width="11" height="9.6" rx="1.4" />
      <circle cx="5.6" cy="6.1" r=".9" fill="currentColor" stroke="none" />
      <path d="m3.3 11.4 3.1-3 2.1 1.9 1.8-1.7 2.4 2.8" />
    </>
  ),
  music: (
    <>
      <path d="M6.4 11.8V4.6l6-1.3v7.2" />
      <circle cx="4.9" cy="11.8" r="1.5" />
      <circle cx="10.9" cy="10.5" r="1.5" />
    </>
  ),
  movies: (
    <>
      <rect x="2.4" y="3.5" width="11.2" height="9" rx="1.4" />
      <path d="m6.8 6.1 3.3 1.9-3.3 1.9Z" fill="currentColor" stroke="none" />
    </>
  ),
  folder: (
    <path d="M2.4 4.8c0-.7.5-1.2 1.2-1.2h3.1l1.3 1.4h4.4c.7 0 1.2.5 1.2 1.2v5.8c0 .7-.5 1.2-1.2 1.2H3.6c-.7 0-1.2-.5-1.2-1.2Z" />
  ),
  file: (
    <>
      <path d="M4.4 2.5h4.9l2.5 2.5v7.7a.9.9 0 0 1-.9.9H4.4a.9.9 0 0 1-.9-.9V3.4a.9.9 0 0 1 .9-.9Z" />
      <path d="M9.1 2.6V5h2.5" />
    </>
  ),
  pin: (
    <path d="m9.8 2.8 3.4 3.4-1.5 1.5-.8-.3-2.3 2.3.4 2.1-1.1 1.1-2.3-2.3-2.5 2.5m2.5-2.5L3.3 8.3l1.1-1.1 2.1.4 2.3-2.3-.3-.8Z" />
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="5.6" />
      <path d="M8 5v3.2l2.2 1.3" />
    </>
  ),
  internalDisk: (
    <>
      <rect x="2.5" y="3.5" width="11" height="9" rx="1.6" />
      <path d="M2.6 9.5h10.8" />
      <circle cx="11.2" cy="11" r=".7" fill="currentColor" stroke="none" />
    </>
  ),
  externalDisk: (
    <>
      <path d="M3.7 4.2h8.6l1.2 5.1v2.6a1.1 1.1 0 0 1-1.1 1.1H3.6a1.1 1.1 0 0 1-1.1-1.1V9.3Z" />
      <path d="M2.6 9.3h10.8" />
      <circle cx="11" cy="11.1" r=".7" fill="currentColor" stroke="none" />
    </>
  ),
  networkGlobe: (
    <>
      <circle cx="8" cy="8" r="5.6" />
      <path d="M2.6 8h10.8M8 2.5c1.6 1.5 2.4 3.4 2.4 5.5S9.6 12 8 13.5C6.4 12 5.6 10.1 5.6 8S6.4 4 8 2.5Z" />
    </>
  ),
  cloud: (
    <path d="M4.8 12.2h6.7a2.6 2.6 0 0 0 .3-5.2A3.8 3.8 0 0 0 4.5 6a2.9 2.9 0 0 0 .3 6.2Z" />
  ),
  eject: (
    <>
      <path d="M8 4.2 3.8 9.2h8.4Z" fill="currentColor" stroke="none" />
      <path d="M4 11.6h8" />
    </>
  ),
  disconnect: (
    <>
      <path d="M6.2 9.8 3.5 12.5M12.5 3.5 9.8 6.2M5.2 7.5 4 8.7a2 2 0 0 0 2.8 2.8l1.2-1.2M10.8 8.5 12 7.3a2 2 0 0 0-2.8-2.8L8 5.7M3 3l10 10" />
    </>
  ),
  chevronRight: <path d="m6.2 3.8 4.2 4.2-4.2 4.2" />,
  chevronLeft: <path d="M9.8 3.8 5.6 8l4.2 4.2" />,
  chevronDown: <path d="m4 6.2 4 4 4-4" />,
  chevronUp: <path d="m4 9.8 4-4 4 4" />,
  sortAsc: <path d="m4.5 9.8 3.5-3.6 3.5 3.6" />,
  sortDesc: <path d="m4.5 6.2 3.5 3.6 3.5-3.6" />,
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  close: <path d="m4.3 4.3 7.4 7.4M11.7 4.3l-7.4 7.4" />,
  moreHorizontal: (
    <>
      <circle cx="4" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="8" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  chatBubble: (
    <path d="M3.2 4.2h9.6a1.2 1.2 0 0 1 1.2 1.2v5.2a1.2 1.2 0 0 1-1.2 1.2H7.2l-2.9 2.1v-2.1H3.2A1.2 1.2 0 0 1 2 10.6V5.4a1.2 1.2 0 0 1 1.2-1.2Z" />
  ),
  wand: (
    <>
      <path d="m3.2 12.8 6.9-6.9M8.8 4.5l2.7 2.7" />
      <path d="M12.2 2.2v2M11.2 3.2h2M4.5 3v1.6M3.7 3.8h1.6M12.5 8.8v1.6M11.7 9.6h1.6" />
    </>
  ),
  sparkles: (
    <>
      <path d="m8 2.4 1.2 3.3L12.5 7 9.2 8.2 8 11.5 6.8 8.2 3.5 7l3.3-1.3Z" />
      <path d="M12.6 10.8v2.4M11.4 12h2.4" />
    </>
  ),
  renameAction: (
    <>
      <path d="M2.8 13.2h2.6l6.9-6.9-2.6-2.6-6.9 6.9v2.6Z" />
      <path d="m8.6 4.8 2.6 2.6" />
    </>
  ),
  organizeAction: (
    <>
      <rect x="2.4" y="3" width="4.6" height="4.2" rx=".8" />
      <rect x="9" y="3" width="4.6" height="4.2" rx=".8" />
      <rect x="5.7" y="9" width="4.6" height="4.2" rx=".8" />
      <path d="M4.7 7.2v1.1h6.6V7.2M8 8.3V9" />
    </>
  ),
  newFolderAction: (
    <>
      <path d="M2.4 4.8c0-.7.5-1.2 1.2-1.2h3.1l1.3 1.4h4.4c.7 0 1.2.5 1.2 1.2v5.8c0 .7-.5 1.2-1.2 1.2H3.6c-.7 0-1.2-.5-1.2-1.2Z" />
      <path d="M8 7.3v3.4M6.3 9h3.4" />
    </>
  ),
  trashAction: (
    <>
      <path d="M3.2 4.8h9.6M6.2 4.8V3.5a.7.7 0 0 1 .7-.7h2.2a.7.7 0 0 1 .7.7v1.3M4.4 4.8l.6 8a1 1 0 0 0 1 .9h4a1 1 0 0 0 1-.9l.6-8" />
    </>
  ),
  warning: (
    <>
      <path d="M8 2.8 13.8 13H2.2Z" />
      <path d="M8 6.8v2.8M8 11.4h.01" />
    </>
  ),
  wrench: (
    <path d="M10.8 2.8a3.2 3.2 0 0 0-3 4.3L3.1 11.8a1.2 1.2 0 0 0 1.7 1.7l4.7-4.7a3.2 3.2 0 0 0 4.3-3l-1.9 1.9-1.6-.4-.4-1.6Z" />
  ),
  scissors: (
    <>
      <circle cx="4.4" cy="4.6" r="1.7" />
      <circle cx="4.4" cy="11.4" r="1.7" />
      <path d="M5.8 5.6 13 11.8M5.8 10.4 13 4.2" />
    </>
  ),
  copy: (
    <>
      <rect x="5.6" y="5.6" width="7.4" height="7.4" rx="1.2" />
      <path d="M10.4 5.6V4.2A1.2 1.2 0 0 0 9.2 3H4.2A1.2 1.2 0 0 0 3 4.2v5a1.2 1.2 0 0 0 1.2 1.2h1.4" />
    </>
  ),
  check: <path d="m3.5 8.3 3 3 6-6.4" />,
}

export function placeIconName(labelKey: string): UiIconName {
  switch (labelKey) {
    case 'home': return 'home'
    case 'desktop': return 'desktop'
    case 'documents': return 'documents'
    case 'downloads': return 'downloads'
    case 'pictures': return 'pictures'
    case 'music': return 'music'
    case 'movies': return 'movies'
    default: return 'folder'
  }
}

export function volumeIconName(kind: string): UiIconName {
  if (kind === 'internal') return 'internalDisk'
  if (kind === 'network') return 'networkGlobe'
  return 'externalDisk'
}

export function UiIcon({
  name,
  className = 'h-3.5 w-3.5',
}: {
  name: UiIconName
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}

export function EmptyFolderIllustration({ className = 'h-14 w-14' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="clive-empty-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.16" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id="clive-empty-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.24" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <path
        d="M8 18c0-2.8 2.2-5 5-5h12.4c1.5 0 2.9.7 3.8 1.9l2.6 3.1c.8 1 2 1.5 3.3 1.5H51c2.8 0 5 2.2 5 5v22c0 3.3-2.7 6-6 6H14c-3.3 0-6-2.7-6-6V18Z"
        fill="url(#clive-empty-back)"
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="1.5"
      />
      <path
        d="M14 23h36a2 2 0 0 1 2 2v3H12v-3a2 2 0 0 1 2-2Z"
        fill="currentColor"
        fillOpacity="0.08"
      />
      <path
        d="M7.5 27.5h49l-3 19.5c-.4 3-2.9 5.5-6 5.5H16.5c-3.1 0-5.6-2.5-6-5.5l-3-19.5Z"
        fill="url(#clive-empty-front)"
        stroke="currentColor"
        strokeOpacity="0.34"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M25 39h14"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeDasharray="2.5 3.5"
      />
    </svg>
  )
}
