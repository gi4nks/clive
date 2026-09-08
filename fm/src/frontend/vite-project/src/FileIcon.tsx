import type { ReactNode } from 'react'
import type { FileEntry } from './api'

type Kind =
  | 'folder' | 'home' | 'desktop' | 'documents' | 'downloads' | 'pictures' | 'music' | 'movies'
  | 'applications' | 'library'
  | 'image' | 'video' | 'audio' | 'code' | 'markdown' | 'doc' | 'sheet' | 'slides' | 'pdf'
  | 'text' | 'archive' | 'data' | 'font' | 'executable' | 'app' | 'config' | 'key' | 'disk' | 'file'

const byExt: Array<[Kind, string[]]> = [
  ['image', ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tiff', 'tif', 'svg', 'raw']],
  ['video', ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'mpg', 'flv']],
  ['audio', ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'aiff', 'alac']],
  ['archive', ['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'dmg', 'iso']],
  ['pdf', ['pdf']],
  ['markdown', ['md', 'mdx']],
  ['doc', ['doc', 'docx', 'rtf', 'odt', 'pages']],
  ['sheet', ['xls', 'xlsx', 'csv', 'ods', 'numbers']],
  ['slides', ['ppt', 'pptx', 'key', 'odp']],
  ['code', ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'css', 'scss', 'html', 'rs', 'go', 'py', 'rb', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'sh', 'zsh', 'bash', 'php']],
  ['config', ['toml', 'ini', 'env', 'conf', 'cfg', 'editorconfig']],
  ['data', ['json', 'yaml', 'yml', 'xml', 'sql', 'ndjson']],
  ['font', ['ttf', 'otf', 'woff', 'woff2']],
  ['executable', ['exe', 'bat', 'cmd', 'app', 'bin', 'run']],
  ['key', ['pem', 'key', 'p12', 'pfx', 'cer', 'crt']],
  ['text', ['txt', 'log']],
]

const SYS_DIRS: Array<[Kind, string[]]> = [
  ['desktop', ['desktop']],
  ['documents', ['documents', 'docs']],
  ['downloads', ['downloads', 'download']],
  ['pictures', ['pictures', 'photos', 'images']],
  ['music', ['music']],
  ['movies', ['movies', 'videos', 'film']],
  ['applications', ['applications', 'apps']],
  ['library', ['library']],
]

function kindOf(entry: FileEntry): Kind {
  if (entry.isDir) {
    const n = entry.name.toLowerCase()
    for (const [kind, names] of SYS_DIRS) if (names.includes(n)) return kind
    return 'folder'
  }
  const ext = (entry.extension ?? entry.name.split('.').pop() ?? '').toLowerCase()
  if (!entry.extension) return 'file'
  if (ext === 'app' || (ext === 'zip' && entry.name.toLowerCase().endsWith('.app'))) return 'app'
  for (const [kind, exts] of byExt) if (exts.includes(ext)) return kind
  return 'file'
}

const PALETTE: Record<Kind, string> = {
  folder: '#3b82f6', home: '#0ea5e9', desktop: '#6366f1', documents: '#3b82f6', downloads: '#22c55e',
  pictures: '#ec4899', music: '#f43f5e', movies: '#a855f7', applications: '#f59e0b', library: '#14b8a6',
  image: '#0ea5e9', video: '#8b5cf6', audio: '#ec4899', code: '#f97316', markdown: '#64748b',
  doc: '#2563eb', sheet: '#16a34a', slides: '#ea580c', pdf: '#dc2626', text: '#94a3b8',
  archive: '#a16207', data: '#0891b2', font: '#7c3aed', executable: '#059669', app: '#f59e0b',
  config: '#ca8a04', key: '#eab308', disk: '#64748b', file: '#9ca3af',
}

// White line/fill glyphs on a colored tile (24x24 viewport).
function glyph(kind: Kind): ReactNode {
  const s = { fill: 'none', stroke: '#fff', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const f = { fill: '#fff' }
  switch (kind) {
    case 'folder': case 'documents':
      return <path d="M4 7a1.6 1.6 0 0 1 1.6-1.6H10l1.4 1.6H18A1.6 1.6 0 0 1 19.6 8.6V17a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 17Z" {...f} />
    case 'home':
      return <path d="M4 11l8-6.5 8 6.5M6.5 9.5V18h11V9.5" {...s} />
    case 'desktop':
      return <g><rect x="4" y="5" width="16" height="11" rx="1.4" {...s} /><path d="M9 19h6" {...s} /></g>
    case 'downloads':
      return <path d="M12 4v10m0 0l-4-4m4 4l4-4M5 19h14" {...s} />
    case 'pictures': case 'image':
      return <g><rect x="4" y="5" width="16" height="14" rx="1.6" {...s} /><circle cx="9" cy="10" r="1.6" {...f} /><path d="m5 17 4.5-4.5 3 2.5L16 11l3 4" {...s} /></g>
    case 'music': case 'audio':
      return <path d="M9 17V8l8-2v8M9 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm8-2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" {...s} />
    case 'movies': case 'video':
      return <g><rect x="4" y="6" width="16" height="12" rx="1.6" {...s} /><path d="M11 9.5l4 2.5-4 2.5Z" {...f} /></g>
    case 'applications': case 'app':
      return <g>{[6, 12, 18].map((cx) => [6, 12, 18].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2" {...f} />))}</g>
    case 'library':
      return <path d="M5 5h4v14H5zM11 5h4v14h-4zM17 6l3 1-3 12" {...s} />
    case 'code':
      return <g {...s}><path d="M9.5 8 6 12l3.5 4M14.5 8 18 12l-3.5 4" /></g>
    case 'markdown':
      return <g><rect x="3" y="6.5" width="18" height="11" rx="1.6" {...s} /><path d="M6.5 14.5v-5l2.5 3 2.5-3v5M15 10v4m0 0 1.8-2M15 14l-1.8-2" {...s} /></g>
    case 'doc': case 'text': case 'file':
      return <g {...s}><path d="M6 4h8l4 4v12H6z" /><path d="M14 4v4h4" /></g>
    case 'sheet':
      return <g {...s}><rect x="5" y="5" width="14" height="14" rx="1.4" /><path d="M5 10h14M5 15h14M10 5v14M15 5v14" /></g>
    case 'slides':
      return <g {...s}><rect x="4" y="5" width="16" height="11" rx="1.4" /><path d="M12 16v3m-3 0h6" /></g>
    case 'pdf':
      return <g><path d="M6 4h8l4 4v12H6z" {...s} /><text x="12" y="15" textAnchor="middle" fontSize="5.2" fontWeight="700" fill="#fff" stroke="none">PDF</text></g>
    case 'archive':
      return <g {...s}><rect x="5" y="4" width="14" height="16" rx="1.4" /><path d="M12 4v3M10.5 9h3M10.5 12h3M10.5 15h3" /></g>
    case 'data':
      return <g {...s}><ellipse cx="12" cy="6" rx="6" ry="2.4" /><path d="M6 6v6c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4V6" /><path d="M6 12v5c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4v-5" /></g>
    case 'font':
      return <path d="M6 19 11 5h2l5 14M8 14h8" {...s} />
    case 'executable':
      return <g {...s}><rect x="3.5" y="5" width="17" height="14" rx="1.6" /><path d="m7.5 12 2.5 2 4-4.5" /></g>
    case 'config':
      return <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0-5v2m0 11v2m7-7h-2M7 12H5m12.1 5-1.4-1.4M8.3 8.3 6.9 6.9m10.2 0-1.4 1.4M8.3 15.7l-1.4 1.4" {...s} />
    case 'key':
      return <g {...s}><circle cx="8" cy="12" r="3.5" /><path d="M11.5 12H21m-3 0v3m-2.5-3v2.5" /></g>
    case 'disk':
      return <g {...s}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12m14-12v12M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></g>
    default:
      return <path d="M6 4h8l4 4v12H6z" {...s} />
  }
}

export function FileIcon({ entry }: { entry: FileEntry }) {
  const kind = kindOf(entry)
  const color = PALETTE[kind]
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center">
      <svg viewBox="0 0 24 24" className="h-7 w-7 drop-shadow-sm" role="img" aria-label={kind}>
        <rect x="1" y="1" width="22" height="22" rx="6" fill={color} />
        {glyph(kind)}
      </svg>
    </div>
  )
}
