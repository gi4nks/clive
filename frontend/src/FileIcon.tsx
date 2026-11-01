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
  ['slides', ['ppt', 'pptx', 'odp']],
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

function extOf(entry: FileEntry): string {
  if (entry.isDir) return ''
  const raw = entry.extension ?? (entry.name.includes('.') ? entry.name.split('.').pop() : '') ?? ''
  return raw.toLowerCase()
}

function kindOf(entry: FileEntry): Kind {
  if (entry.isDir) {
    const n = entry.name.toLowerCase()
    for (const [kind, names] of SYS_DIRS) if (names.includes(n)) return kind
    return 'folder'
  }
  const ext = extOf(entry)
  if (ext === 'app' || (ext === 'zip' && entry.name.toLowerCase().endsWith('.app'))) return 'app'
  for (const [kind, exts] of byExt) if (exts.includes(ext)) return kind
  return 'file'
}

const EXT_BADGE: Record<string, string> = {
  ts: 'TS', tsx: 'TSX', js: 'JS', jsx: 'JSX', mjs: 'JS', cjs: 'JS',
  rs: 'RS', py: 'PY', go: 'GO', swift: 'SWIFT', kt: 'KT', java: 'JAVA',
  cpp: 'C++', hpp: 'H++', c: 'C', h: 'H', css: 'CSS', scss: 'SCSS',
  html: 'HTML', sh: 'SH', zsh: 'ZSH', bash: 'SH', rb: 'RB', php: 'PHP',
  json: 'JSON', ndjson: 'JSON', yaml: 'YAML', yml: 'YAML', xml: 'XML', sql: 'SQL',
  toml: 'TOML', ini: 'INI', env: 'ENV', conf: 'CONF', cfg: 'CFG',
  md: 'MD', mdx: 'MDX', pdf: 'PDF',
  doc: 'DOC', docx: 'DOCX', rtf: 'RTF', odt: 'ODT', pages: 'PAGES',
  xls: 'XLS', xlsx: 'XLSX', csv: 'CSV', ods: 'ODS', numbers: 'NUM',
  ppt: 'PPT', pptx: 'PPTX', odp: 'ODP',
  zip: 'ZIP', tar: 'TAR', gz: 'GZ', tgz: 'TGZ', '7z': '7Z', rar: 'RAR', dmg: 'DMG', iso: 'ISO',
  png: 'PNG', jpg: 'JPG', jpeg: 'JPG', gif: 'GIF', webp: 'WEBP', heic: 'HEIC', svg: 'SVG', raw: 'RAW',
  mp4: 'MP4', mov: 'MOV', mkv: 'MKV', webm: 'WEBM',
  mp3: 'MP3', wav: 'WAV', flac: 'FLAC', m4a: 'M4A', aiff: 'AIFF',
  pem: 'PEM', key: 'KEY', crt: 'CRT', cer: 'CER', p12: 'P12',
  ttf: 'TTF', otf: 'OTF', woff: 'WOFF', woff2: 'WOFF2',
  txt: 'TXT', log: 'LOG', exe: 'EXE', bin: 'BIN',
}

interface FolderPalette {
  backTop: string
  backBot: string
  frontTop: string
  frontBot: string
  edge: string
  glyph: string
}

const FOLDER_PALETTE: Record<string, FolderPalette> = {
  folder: { backTop: '#64a8f5', backBot: '#4a8fe0', frontTop: '#8cc6ff', frontBot: '#5ba4f5', edge: '#3f82d1', glyph: '#1d5ca8' },
  home: { backTop: '#5ca3f0', backBot: '#4489d8', frontTop: '#87c2ff', frontBot: '#569ff0', edge: '#3b7bc7', glyph: '#1a569e' },
  desktop: { backTop: '#5f95df', backBot: '#477bc6', frontTop: '#8bb8f4', frontBot: '#5b90dc', edge: '#3f6fb8', glyph: '#1f4d91' },
  documents: { backTop: '#5ea4f2', backBot: '#468ad9', frontTop: '#89c4ff', frontBot: '#589ef0', edge: '#3d7cc9', glyph: '#1b58a1' },
  downloads: { backTop: '#4bb89a', backBot: '#369b80', frontTop: '#77d7bc', frontBot: '#46b596', edge: '#2f8a71', glyph: '#16614d' },
  pictures: { backTop: '#df7893', backBot: '#c65c78', frontTop: '#f59fb5', frontBot: '#de738f', edge: '#b54f6a', glyph: '#822841' },
  music: { backTop: '#9c78dc', backBot: '#815cc2', frontTop: '#bda0f2', frontBot: '#9873d9', edge: '#714eb0', glyph: '#4a2985' },
  movies: { backTop: '#6888be', backBot: '#4f6ea4', frontTop: '#90acd8', frontBot: '#6685bc', edge: '#446194', glyph: '#253f6e' },
  applications: { backTop: '#7685cc', backBot: '#5b6ab3', frontTop: '#9ca8e3', frontBot: '#7483ca', edge: '#505ea3', glyph: '#2d3a7a' },
  library: { backTop: '#7ea87e', backBot: '#648e64', frontTop: '#a4c8a4', frontBot: '#7ba57b', edge: '#567e56', glyph: '#315731' },
}

function folderMark(kind: Kind, color: string): ReactNode {
  const strokeProps = {
    fill: 'none',
    stroke: color,
    strokeOpacity: 0.78,
    strokeWidth: 1.45,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (kind) {
    case 'home':
      return <g {...strokeProps}><path d="M12.2 18.4 16 15.3l3.8 3.1" /><path d="M13.4 17.6v4h5.2v-4" /></g>
    case 'desktop':
      return <g {...strokeProps}><rect x="12.3" y="15.4" width="7.4" height="4.8" rx=".9" /><path d="M16 20.3v1.6m-2.1 0h4.2" /></g>
    case 'documents':
      return <g {...strokeProps}><rect x="13" y="15.1" width="6" height="6.8" rx=".8" /><path d="M14.5 17.3h3m-3 1.7h3m-3 1.6h1.9" /></g>
    case 'downloads':
      return <g {...strokeProps}><path d="M16 15.2v5.1m-2.1-2 2.1 2.1 2.1-2.1M13.2 22h5.6" /></g>
    case 'pictures':
      return (
        <g {...strokeProps}>
          <rect x="12.2" y="15.3" width="7.6" height="6.4" rx=".9" />
          <circle cx="14.4" cy="17.3" r=".65" fill={color} fillOpacity="0.78" stroke="none" />
          <path d="m13 20.9 2-2 1.4 1.2 1.3-1.3 1.5 2.1" />
        </g>
      )
    case 'music':
      return (
        <g {...strokeProps}>
          <path d="M14.8 20.8v-4.7l4-1v4.6" />
          <circle cx="13.7" cy="20.8" r="1.05" fill={color} fillOpacity="0.75" />
          <circle cx="17.7" cy="19.7" r="1.05" fill={color} fillOpacity="0.75" />
        </g>
      )
    case 'movies':
      return (
        <g {...strokeProps}>
          <rect x="12.2" y="15.5" width="7.6" height="6" rx=".9" />
          <path d="m15.1 17.2 2.5 1.3-2.5 1.3Z" fill={color} fillOpacity="0.78" stroke="none" />
        </g>
      )
    case 'applications':
      return (
        <g fill={color} fillOpacity="0.76">
          <rect x="13.1" y="15.4" width="2.4" height="2.4" rx=".6" />
          <rect x="16.5" y="15.4" width="2.4" height="2.4" rx=".6" />
          <rect x="13.1" y="18.8" width="2.4" height="2.4" rx=".6" />
          <rect x="16.5" y="18.8" width="2.4" height="2.4" rx=".6" />
        </g>
      )
    case 'library':
      return <g {...strokeProps}><path d="M13 15.4h1.5v6.2H13zm2.4 0h1.5v6.2h-1.5zm2.5.2 1.4.3-1 5.7-1.4-.3z" /></g>
    default:
      return null
  }
}

function folderArtwork(kind: Kind, card: boolean): ReactNode {
  const pal = FOLDER_PALETTE[kind] ?? FOLDER_PALETTE.folder
  const id = `clive-fld-${kind}`
  return (
    <g strokeLinejoin="round">
      <defs>
        <linearGradient id={`${id}-b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={pal.backTop} />
          <stop offset="1" stopColor={pal.backBot} />
        </linearGradient>
        <linearGradient id={`${id}-f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={pal.frontTop} />
          <stop offset="1" stopColor={pal.frontBot} />
        </linearGradient>
      </defs>
      {/* Back tab */}
      <path
        d="M3 8.4C3 6.9 4.2 5.8 5.6 5.8h6.2c.8 0 1.5.35 2 .95l1.35 1.6c.35.42.87.65 1.42.65h9.83c1.45 0 2.6 1.15 2.6 2.6v11.8c0 1.5-1.2 2.6-2.6 2.6H5.6C4.15 26 3 24.85 3 23.4Z"
        fill={`url(#${id}-b)`}
        stroke={pal.edge}
        strokeWidth=".65"
      />
      {/* Subtle paper sheet peeking inside */}
      <rect x="5" y="10.1" width="22" height="3.2" rx="1" fill="#ffffff" fillOpacity={card ? 0.86 : 0.72} />
      {/* Front pocket */}
      <path
        d="M2.8 12.6c0-.9.72-1.6 1.6-1.6h23.2c.88 0 1.6.7 1.6 1.6l-1.1 11.1c-.14 1.35-1.25 2.3-2.6 2.3H6.5c-1.35 0-2.46-.95-2.6-2.3Z"
        fill={`url(#${id}-f)`}
        stroke={pal.edge}
        strokeWidth=".65"
      />
      {/* Top specular highlight */}
      <path d="M4.2 11.85h23.6" stroke="#ffffff" strokeOpacity="0.62" strokeWidth=".75" strokeLinecap="round" />
      {folderMark(kind, pal.glyph)}
    </g>
  )
}

function pillBadge(label: string | undefined, bg: string, fg = '#ffffff'): ReactNode {
  if (!label) return null
  const text = label.slice(0, 5)
  const w = Math.max(10.5, text.length * 3.1 + 3.6)
  const x = 16 - w / 2
  return (
    <g>
      <rect x={x} y="22.1" width={w} height="5.1" rx="1.4" fill={bg} />
      <text
        x="16"
        y="25.75"
        textAnchor="middle"
        fontSize={text.length >= 5 ? '3.15' : '3.55'}
        fontWeight="700"
        letterSpacing=".2"
        fontFamily="ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif"
        fill={fg}
      >
        {text}
      </text>
    </g>
  )
}

function paperBase(id: string, tintTop = '#ffffff', tintBot = '#f1f5f9', cornerFill = '#e2e8f0', stroke = '#b8c4d2'): ReactNode {
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tintTop} />
          <stop offset="1" stopColor={tintBot} />
        </linearGradient>
      </defs>
      <path
        d="M7.2 3h11.1l6.5 6.5v17.7c0 1.1-.9 2-2 2H7.2c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2Z"
        fill={`url(#${id})`}
        stroke={stroke}
        strokeWidth=".75"
      />
      {/* Corner fold cast shadow */}
      <path d="M18.3 9.5h6.5l-6.5 2.1Z" fill="#0f172a" fillOpacity="0.06" />
      {/* Folded ear */}
      <path
        d="M18.3 3v4.9c0 .9.7 1.6 1.6 1.6h4.9Z"
        fill={cornerFill}
        stroke={stroke}
        strokeWidth=".7"
        strokeLinejoin="round"
      />
      {/* Specular inner highlight */}
      <path d="M7.2 3.75h10.4" stroke="#ffffff" strokeOpacity="0.9" strokeWidth=".7" strokeLinecap="round" />
    </>
  )
}

function artwork(kind: Kind, ext: string, card: boolean): ReactNode {
  if (SYS_DIRS.some(([folderKind]) => folderKind === kind) || kind === 'folder') {
    return folderArtwork(kind, card)
  }
  const badge = card ? EXT_BADGE[ext] : undefined

  switch (kind) {
    case 'pdf':
      return (
        <g strokeLinejoin="round">
          {paperBase('clive-doc-pdf', '#fffdfb', '#f9efed', '#f1d6d2', '#cfa9a4')}
          <rect x="6.6" y="13.4" width="18.8" height="7.4" rx="1.5" fill="#c8473f" />
          <path d="M7.4 14.1h17.2" stroke="#ffffff" strokeOpacity="0.28" strokeWidth=".6" strokeLinecap="round" />
          <text
            x="16"
            y="18.6"
            textAnchor="middle"
            fontSize="5.2"
            fontWeight="800"
            letterSpacing=".45"
            fontFamily="ui-sans-serif, -apple-system, sans-serif"
            fill="#ffffff"
          >
            PDF
          </text>
          {card && (
            <g stroke="#dfc2be" strokeWidth=".9" strokeLinecap="round">
              <path d="M9 10.6h6.4M9 23.4h14M9 25.7h9.5" />
            </g>
          )}
        </g>
      )

    case 'code':
      return (
        <g strokeLinejoin="round">
          <defs>
            <linearGradient id="clive-code-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3d5369" />
              <stop offset="1" stopColor="#223244" />
            </linearGradient>
          </defs>
          <rect x="3.5" y="4.5" width="25" height="23" rx="3.4" fill="url(#clive-code-bg)" stroke="#1b2838" strokeWidth=".75" />
          <path d="M4.2 10.2h23.6" stroke="#ffffff" strokeOpacity="0.14" strokeWidth=".7" />
          <path d="M5.5 5.3h21" stroke="#ffffff" strokeOpacity="0.22" strokeWidth=".65" strokeLinecap="round" />
          <circle cx="7.2" cy="7.5" r=".95" fill="#f0786c" />
          <circle cx="10.2" cy="7.5" r=".95" fill="#ebb951" />
          <circle cx="13.2" cy="7.5" r=".95" fill="#6cc082" />
          <path
            d={card ? 'm12.5 13.5-2.8 2.8 2.8 2.8m7-5.6 2.8 2.8-2.8 2.8m-2.1-6.5-2.8 7.4' : 'm12.6 15-3 3.2 3 3.2m6.8-6.4 3 3.2-3 3.2m-2-7.2-2.8 8'}
            fill="none"
            stroke="#e8f1fa"
            strokeWidth="1.55"
            strokeLinecap="round"
          />
          {pillBadge(badge ?? (card ? 'CODE' : undefined), '#4f86c6')}
        </g>
      )

    case 'data':
      return (
        <g strokeLinejoin="round">
          {paperBase('clive-doc-data', '#f9fffe', '#ebf6f5', '#cfe8e6', '#94bdbc')}
          <path
            d={card ? 'M12.8 12.2c-1.2 0-1.7.5-1.7 1.5v1.2c0 .7-.4 1.1-1.1 1.1.7 0 1.1.4 1.1 1.1v1.2c0 1 .5 1.5 1.7 1.5m6.4-7.6c1.2 0 1.7.5 1.7 1.5v1.2c0 .7.4 1.1 1.1 1.1-.7 0-1.1.4-1.1 1.1v1.2c0 1-.5 1.5-1.7 1.5' : 'M12.6 13.4c-1.3 0-1.8.6-1.8 1.7v1.4c0 .8-.5 1.2-1.2 1.2.7 0 1.2.4 1.2 1.2v1.4c0 1.1.5 1.7 1.8 1.7m6.8-8.6c1.3 0 1.8.6 1.8 1.7v1.4c0 .8.5 1.2 1.2 1.2-.7 0-1.2.4-1.2 1.2v1.4c0 1.1-.5 1.7-1.8 1.7'}
            fill="none"
            stroke="#267975"
            strokeWidth="1.45"
            strokeLinecap="round"
          />
          <circle cx="16" cy={card ? '16' : '17.7'} r=".95" fill="#267975" />
          {pillBadge(badge ?? (card ? 'DATA' : undefined), '#2c8480')}
        </g>
      )

    case 'markdown':
      return (
        <g strokeLinejoin="round">
          {paperBase('clive-doc-md', '#fcfdff', '#edf3fa', '#d5e2f2', '#a3b8d1')}
          <path
            d={card ? 'M9.3 19.2v-5.8h1.8l2 2.6 2-2.6h1.8v5.8h-1.7v-3.2l-2.1 2.5-2.1-2.5v3.2Zm11.1-5.8v3.6m-1.6-1.5 1.6 1.8 1.6-1.8' : 'M9.3 21.5v-6.2h1.9l2.1 2.8 2.1-2.8h1.9v6.2h-1.8V18l-2.2 2.6-2.2-2.6v3.5Zm11.2-6.2v4m-1.7-1.6 1.7 1.9 1.7-1.9'}
            fill="none"
            stroke="#336296"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {pillBadge(badge ?? (card ? 'MD' : undefined), '#3b6ea8')}
        </g>
      )

    case 'doc':
      return (
        <g strokeLinejoin="round">
          {paperBase('clive-doc-word', '#ffffff', '#eef4fb', '#d5e3f5', '#a6bbd6')}
          <rect x="8.8" y="11.2" width="7.2" height="2" rx=".8" fill="#3a72b8" />
          <g stroke="#7a98be" strokeWidth="1.15" strokeLinecap="round">
            <path d="M8.8 15.6h13.8M8.8 18.2h13.8" />
            {!card && <path d="M8.8 20.8h9.6" />}
            {card && <path d="M8.8 20.4h9.2" />}
          </g>
          {pillBadge(badge ?? (card ? 'DOC' : undefined), '#3a72b8')}
        </g>
      )

    case 'sheet':
      return (
        <g strokeLinejoin="round">
          {paperBase('clive-doc-sheet', '#fbfefc', '#eaf6ef', '#cce7d7', '#93bfa6')}
          <rect x="8.5" y="11.5" width="15" height={card ? '9.2' : '12.5'} rx="1.2" fill="#ffffff" stroke="#48946e" strokeWidth="1" />
          <path d="M8.5 14.3h15" stroke="#48946e" strokeWidth="1" />
          <rect x="9" y="12" width="14" height="2" rx=".5" fill="#48946e" fillOpacity="0.22" />
          <path d={card ? 'M8.5 17.5h15M13.5 11.5v9.2M18.5 11.5v9.2' : 'M8.5 17.6h15M8.5 20.8h15M13.5 11.5V24M18.5 11.5V24'} stroke="#8ec2a6" strokeWidth=".85" />
          {pillBadge(badge ?? (card ? 'SHEET' : undefined), '#38855f')}
        </g>
      )

    case 'slides':
      return (
        <g strokeLinejoin="round">
          <defs>
            <linearGradient id="clive-slides-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#e58c4e" />
              <stop offset="1" stopColor="#c4682d" />
            </linearGradient>
          </defs>
          <rect x="3" y="5" width="26" height="21" rx="3.2" fill="url(#clive-slides-bg)" stroke="#9e5020" strokeWidth=".75" />
          <rect x="5.6" y="7.8" width="20.8" height={card ? '12.2' : '14.4'} rx="1.6" fill="#fffaf5" />
          <path d="M8.5 17.5v-3.2M12 17.5v-5.2M15.5 17.5v-2.1" stroke="#d47236" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="21" cy="13.5" r="2.6" fill="#f0ad68" />
          <path d="M21 13.5V10.9A2.6 2.6 0 0 1 23.6 13.5Z" fill="#c4682d" />
          {pillBadge(badge ?? (card ? 'DECK' : undefined), '#8f4316')}
        </g>
      )

    case 'image':
      return (
        <g strokeLinejoin="round">
          <defs>
            <linearGradient id="clive-img-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#72b6f4" />
              <stop offset="1" stopColor="#cbe7ff" />
            </linearGradient>
          </defs>
          <rect x="3.5" y="4.2" width="25" height="23.6" rx="3.4" fill="#ffffff" stroke="#aebac8" strokeWidth=".8" />
          <rect x="5.8" y="6.5" width="20.4" height={card ? '14.4' : '17.6'} rx="1.8" fill="url(#clive-img-sky)" />
          <circle cx="21.2" cy="10.8" r="2.1" fill="#ffd466" />
          <path d={card ? 'm6 20.9 6.2-6.6 4.4 4.3 3-3 6.4 5.3Z' : 'm6 24.1 6.4-7.6 4.4 4.8 3-3.4 6.2 6.2Z'} fill="#4e9c78" />
          <path d={card ? 'm13.5 20.9 5.5-5.1 7 5.1Z' : 'm13.5 24.1 5.5-5.8 7 5.8Z'} fill="#367d5d" />
          {pillBadge(badge, '#3e78b2')}
        </g>
      )

    case 'video':
      return (
        <g strokeLinejoin="round">
          <defs>
            <linearGradient id="clive-vid-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#586f94" />
              <stop offset="1" stopColor="#354663" />
            </linearGradient>
          </defs>
          <rect x="3" y="5" width="26" height="22" rx="3.4" fill="url(#clive-vid-bg)" stroke="#27354d" strokeWidth=".75" />
          <path d="M7.4 5.6v20.8M24.6 5.6v20.8" stroke="#ffffff" strokeOpacity="0.24" strokeWidth="1.2" strokeDasharray="1.8 2.1" />
          <circle cx="16" cy={card ? '14.4' : '16'} r="4.8" fill="#ffffff" fillOpacity="0.18" />
          <path d={card ? 'm14.6 12.1 4.1 2.3-4.1 2.3Z' : 'm14.6 13.7 4.1 2.3-4.1 2.3Z'} fill="#ffffff" />
          {pillBadge(badge ?? (card ? 'VIDEO' : undefined), '#24324a')}
        </g>
      )

    case 'audio':
      return (
        <g strokeLinejoin="round">
          <defs>
            <linearGradient id="clive-aud-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#a66fd6" />
              <stop offset="1" stopColor="#7345a3" />
            </linearGradient>
          </defs>
          <rect x="4" y="4" width="24" height="24" rx="5.5" fill="url(#clive-aud-bg)" stroke="#5b3385" strokeWidth=".75" />
          <path d="M6.5 5.2h19" stroke="#ffffff" strokeOpacity="0.3" strokeWidth=".7" strokeLinecap="round" />
          <path
            d={card ? 'M9.5 14.5v-2m3.2 4.5v-7m3.3 8.5v-10m3.3 7.5v-5m3.2 3v-1' : 'M9.5 17v-2m3.2 5v-8m3.3 9.5v-11m3.3 8.5v-6m3.2 3.5v-1.5'}
            stroke="#ffffff"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          {pillBadge(badge, '#4b2770')}
        </g>
      )

    case 'archive':
      return (
        <g strokeLinejoin="round">
          <defs>
            <linearGradient id="clive-arc-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#dfb980" />
              <stop offset="1" stopColor="#be9256" />
            </linearGradient>
          </defs>
          <rect x="4" y="5" width="24" height="22.5" rx="3.2" fill="url(#clive-arc-bg)" stroke="#8f6936" strokeWidth=".75" />
          <path d="M4.5 11.2h23" stroke="#8f6936" strokeOpacity="0.45" strokeWidth=".9" />
          <path d="M5.8 5.9h20.4" stroke="#ffffff" strokeOpacity="0.45" strokeWidth=".7" strokeLinecap="round" />
          {/* Zipper track */}
          <rect x="14.2" y="5.4" width="3.6" height={card ? '15.2' : '18.2'} rx=".8" fill="#705127" fillOpacity="0.24" />
          <path d={card ? 'M14.8 7.5h2.4M14.8 10h2.4M14.8 12.5h2.4M14.8 15h2.4' : 'M14.8 7.5h2.4M14.8 10.2h2.4M14.8 13h2.4M14.8 15.8h2.4'} stroke="#61441e" strokeWidth="1.25" strokeLinecap="round" />
          <rect x="14.5" y={card ? '16.6' : '17.6'} width="3" height="3.8" rx=".9" fill="#fdf6ea" stroke="#61441e" strokeWidth=".8" />
          {pillBadge(badge ?? (card ? 'ZIP' : undefined), '#6e4e24')}
        </g>
      )

    case 'app':
      return (
        <g strokeLinejoin="round">
          <defs>
            <linearGradient id="clive-app-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#5b8def" />
              <stop offset="1" stopColor="#3c61b8" />
            </linearGradient>
          </defs>
          <rect x="3.5" y="3.5" width="25" height="25" rx="5.8" fill="url(#clive-app-bg)" stroke="#2c4a94" strokeWidth=".75" />
          <rect x="6.5" y="7" width="19" height="18" rx="2.6" fill="#f8fafc" />
          <circle cx="9.2" cy="9.4" r=".8" fill="#ef6b63" />
          <circle cx="11.6" cy="9.4" r=".8" fill="#ebb64c" />
          <circle cx="14" cy="9.4" r=".8" fill="#63bf7a" />
          <path d="M6.8 11.6h18.4" stroke="#cbd5e1" strokeWidth=".7" />
          <path d="m14.2 14.6 4.6 3.5-4.6 3.5M12 18.1h6.4" fill="none" stroke="#3c61b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )

    case 'config':
      return (
        <g strokeLinejoin="round">
          {paperBase('clive-doc-cfg', '#fdfcf8', '#f2ede1', '#e0d6c1', '#b6a88c')}
          <g transform={card ? 'translate(0 -1.5)' : 'translate(0 0.3)'} fill="none" stroke="#786640" strokeWidth="1.4" strokeLinecap="round">
            <circle cx="16" cy="17.2" r="2.8" fill="#e8dfc9" />
            <path d="M16 12.6v1.3m0 6.6v1.3m4.6-4.6h-1.3m-6.6 0h-1.3m8-3.3-.9.9m-4.7 4.7-.9.9m6.5 0-.9-.9m-4.7-4.7-.9-.9" />
          </g>
          {pillBadge(badge ?? (card ? 'CFG' : undefined), '#7d6941')}
        </g>
      )

    case 'key':
      return (
        <g strokeLinejoin="round">
          {paperBase('clive-doc-key', '#fffdf8', '#f6efe0', '#e6d8bc', '#bfa87e')}
          <g transform={card ? 'translate(0 -1.4)' : 'translate(0 0.4)'} fill="none" stroke="#9e772b" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="13.8" cy="16.5" r="2.4" fill="#f7e7c1" />
            <path d="m15.6 18.2 4.2 4.1m-1.8-1.8 1.4-1.3m-.1 2.7 1.3-1.3" />
          </g>
          {pillBadge(badge ?? (card ? 'KEY' : undefined), '#997228')}
        </g>
      )

    case 'font':
      return (
        <g strokeLinejoin="round">
          {paperBase('clive-doc-font', '#fdfbff', '#f1ebf7', '#dfd3ec', '#b3a1c7')}
          <text
            x="16"
            y={card ? '19.2' : '21.2'}
            textAnchor="middle"
            fontSize="9.2"
            fontWeight="700"
            fontFamily="Georgia, ui-serif, serif"
            fill="#644985"
          >
            Aa
          </text>
          {pillBadge(badge ?? (card ? 'FONT' : undefined), '#6c4f8f')}
        </g>
      )

    case 'executable':
      return (
        <g strokeLinejoin="round">
          <defs>
            <linearGradient id="clive-exe-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#465852" />
              <stop offset="1" stopColor="#2b3834" />
            </linearGradient>
          </defs>
          <rect x="3.5" y="4.5" width="25" height="23" rx="3.4" fill="url(#clive-exe-bg)" stroke="#1f2926" strokeWidth=".75" />
          <path d="m9.5 12.5 3.6 3.2-3.6 3.2m5.3.2h4.6" fill="none" stroke="#8ce0b5" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          {pillBadge(badge ?? (card ? 'BIN' : undefined), '#3c7d5e')}
        </g>
      )

    case 'disk':
      return (
        <g strokeLinejoin="round">
          <defs>
            <linearGradient id="clive-disk-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#e2e8f0" />
              <stop offset="1" stopColor="#cbd5e1" />
            </linearGradient>
          </defs>
          <rect x="4.5" y="5" width="23" height="22" rx="3.5" fill="url(#clive-disk-bg)" stroke="#8c9cb0" strokeWidth=".8" />
          <path d="M5 20.5h22" stroke="#8c9cb0" strokeWidth=".85" />
          <circle cx="23" cy="23.7" r="1.1" fill="#34c759" />
          <circle cx="16" cy="12.8" r="4.5" fill="#94a3b8" fillOpacity="0.35" stroke="#64748b" strokeWidth=".8" />
          <circle cx="16" cy="12.8" r="1.3" fill="#64748b" />
        </g>
      )

    case 'text':
    case 'file':
    default:
      return (
        <g strokeLinejoin="round">
          {paperBase(`clive-doc-${kind}`, '#ffffff', '#f3f6f9', '#dfe6ee', '#b5c1cf')}
          <g stroke={kind === 'text' ? '#8696a7' : '#a0aec0'} strokeWidth="1.15" strokeLinecap="round">
            <path d="M9.2 13h11.6M9.2 16.2h13.2" />
            <path d={kind === 'text' ? 'M9.2 19.4h9.4' : 'M9.2 19.4h7.2'} />
          </g>
          {pillBadge(badge, '#64748b')}
        </g>
      )
  }
}

export function FileIcon({ entry, size = 'row' }: { entry: FileEntry; size?: 'row' | 'card' }) {
  const kind = kindOf(entry)
  const ext = extOf(entry)
  const card = size === 'card'
  return (
    <div className={`flex shrink-0 items-center justify-center ${card ? 'h-20 w-20' : 'h-8 w-8'}`}>
      <svg
        viewBox="0 0 32 32"
        className={card ? 'h-[76px] w-[76px]' : 'h-7 w-7'}
        style={{ filter: card ? 'drop-shadow(0 2px 3px rgba(15, 23, 42, .16))' : 'drop-shadow(0 1px 1.5px rgba(15, 23, 42, .14))' }}
        role="img"
        aria-label={kind}
        data-icon-kind={kind}
      >
        {artwork(kind, ext, card)}
      </svg>
    </div>
  )
}
