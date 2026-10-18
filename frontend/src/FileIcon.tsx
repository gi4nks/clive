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

function kindOf(entry: FileEntry): Kind {
  if (entry.isDir) {
    const n = entry.name.toLowerCase()
    for (const [kind, names] of SYS_DIRS) if (names.includes(n)) return kind
    return 'folder'
  }
  const ext = (entry.extension ?? entry.name.split('.').pop() ?? '').toLowerCase()
  if (ext === 'app' || (ext === 'zip' && entry.name.toLowerCase().endsWith('.app'))) return 'app'
  for (const [kind, exts] of byExt) if (exts.includes(ext)) return kind
  return 'file'
}

const FOLDER_TONE: Record<Kind, { back: string; front: string; edge: string }> = {
  folder: { back: '#8eb7e9', front: '#a8c9f0', edge: '#6897d0' },
  home: { back: '#86acd4', front: '#a6c5e5', edge: '#668db8' },
  desktop: { back: '#829dc1', front: '#a4b8d2', edge: '#677e9e' },
  documents: { back: '#83aee0', front: '#a6c8ed', edge: '#638ec2' },
  downloads: { back: '#7caf9c', front: '#9cc8b4', edge: '#5d927e' },
  pictures: { back: '#c08e9b', front: '#d7aab5', edge: '#a66f7e' },
  music: { back: '#a18cb7', front: '#bdafd0', edge: '#827099' },
  movies: { back: '#859bb8', front: '#a6b8cf', edge: '#687e9b' },
  applications: { back: '#9a9dbd', front: '#b9bad3', edge: '#777b9e' },
  library: { back: '#9caa93', front: '#bbc7b1', edge: '#7e8e75' },
  image: { back: '#83aee0', front: '#a6c8ed', edge: '#638ec2' },
  video: { back: '#859bb8', front: '#a6b8cf', edge: '#687e9b' },
  audio: { back: '#a18cb7', front: '#bdafd0', edge: '#827099' },
  code: { back: '#8295a8', front: '#a7b7c5', edge: '#687a8c' },
  markdown: { back: '#83aee0', front: '#a6c8ed', edge: '#638ec2' },
  doc: { back: '#83aee0', front: '#a6c8ed', edge: '#638ec2' },
  sheet: { back: '#7caf9c', front: '#9cc8b4', edge: '#5d927e' },
  slides: { back: '#c29b79', front: '#d8b796', edge: '#a47c5c' },
  pdf: { back: '#bc8885', front: '#d3a7a1', edge: '#9f6d6b' },
  text: { back: '#91a2af', front: '#b0bdc7', edge: '#728492' },
  archive: { back: '#a99579', front: '#c5b292', edge: '#897657' },
  data: { back: '#78a7a5', front: '#99c1be', edge: '#5f8987' },
  font: { back: '#9a8cae', front: '#b6a9c6', edge: '#7d708f' },
  executable: { back: '#929eab', front: '#b0bbc5', edge: '#737f8b' },
  app: { back: '#929eab', front: '#b0bbc5', edge: '#737f8b' },
  config: { back: '#b19d74', front: '#cbbb98', edge: '#927e58' },
  key: { back: '#b19d74', front: '#cbbb98', edge: '#927e58' },
  disk: { back: '#929eab', front: '#b0bbc5', edge: '#737f8b' },
  file: { back: '#91a2af', front: '#b0bdc7', edge: '#728492' },
}

function folderMark(kind: Kind): ReactNode {
  const common = { fill: 'none', stroke: '#f9fbfd', strokeWidth: 1.35, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (kind) {
    case 'home': return <path d="m17.2 18.2 2.3-1.8 2.3 1.8v3.1h-4.6z" {...common} />
    case 'desktop': return <g {...common}><rect x="16.8" y="16.5" width="5.4" height="4" rx=".7" /><path d="M19.5 20.6v1.2m-1.7 0h3.4" /></g>
    case 'documents': return <g {...common}><path d="M17.2 16.7h4.5v5h-4.5zM18.2 18.1h2.5m-2.5 1.3h2.5" /></g>
    case 'downloads': return <g {...common}><path d="M19.5 16.5v4.8m-1.9-1.9 1.9 1.9 1.9-1.9M17 22.4h5" /></g>
    case 'pictures': return <g {...common}><rect x="16.7" y="16.4" width="5.7" height="5" rx=".7" /><circle cx="18.4" cy="18" r=".55" fill="#f9fbfd" stroke="none" /><path d="m17.3 20.8 1.6-1.5 1.1.9 1.3-1.2 1 1.1" /></g>
    case 'music': return <path d="M20.9 16.5v4.3a1.2 1.2 0 1 1-1-1.2v-2.5l3-.7v3.4a1.2 1.2 0 1 1-1-1.2v-2.8z" fill="#f9fbfd" />
    case 'movies': return <g {...common}><rect x="16.8" y="16.7" width="5.4" height="4.3" rx=".7" /><path d="m19 17.8 2 1.1-2 1.1z" fill="#f9fbfd" stroke="none" /></g>
    case 'applications': return <g fill="#f9fbfd"><rect x="17" y="16.6" width="2" height="2" rx=".5"/><rect x="20" y="16.6" width="2" height="2" rx=".5"/><rect x="17" y="19.5" width="2" height="2" rx=".5"/><rect x="20" y="19.5" width="2" height="2" rx=".5"/></g>
    case 'library': return <g {...common}><path d="M17.1 16.5h1.2v5.4h-1.2zm2.3 0h1.2v5.4h-1.2zm2.3.3 1.1.2-.9 4.9-1.1-.2z" /></g>
    default: return null
  }
}

function folderArtwork(kind: Kind): ReactNode {
  const tone = FOLDER_TONE[kind]
  return (
    <g strokeLinejoin="round">
      <path d="M3.5 9.1c0-1.3 1-2.3 2.3-2.3h7.1l2.5 2.5h10.8c1.3 0 2.3 1 2.3 2.3v11.1c0 1.4-1.1 2.5-2.5 2.5H6c-1.4 0-2.5-1.1-2.5-2.5z" fill={tone.back} stroke={tone.edge} strokeWidth=".8" />
      <path d="M4.2 12h23.6v1.1H4.2z" fill="#fff" opacity=".32" />
      <path d="M3.7 13.1h24.6l-1.8 9.6c-.2 1.4-1.2 2.3-2.6 2.3H6.1c-1.4 0-2.5-.9-2.6-2.3z" fill={tone.front} stroke={tone.edge} strokeWidth=".8" />
      <path d="m4.5 14.1 1.1 8.1c.1.9.7 1.4 1.7 1.4h16.9c.9 0 1.5-.5 1.7-1.4l1.1-8.1" fill="none" stroke="#fff" strokeWidth=".7" opacity=".42" />
      {folderMark(kind)}
    </g>
  )
}

function pageMark(kind: Kind): ReactNode {
  const accent = ({
    pdf: '#b9514b', doc: '#557ea9', text: '#7d8995', markdown: '#547fae', code: '#596d83',
    sheet: '#5d947a', slides: '#bd8054', image: '#638c82', video: '#667c99', audio: '#9278a2',
    archive: '#9a8059', data: '#528a88', font: '#816d91', executable: '#66716f', app: '#697f9c',
    config: '#99824f', file: '#7d8995', key: '#9b804c', disk: '#73808c',
  } as Partial<Record<Kind, string>>)[kind] ?? '#7d8995'
  const fine = { fill: 'none', stroke: accent, strokeWidth: 1.05, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (kind) {
    case 'pdf': return <g><path d="M10 16.5h8.4" stroke="#d9dce1" strokeWidth=".8"/><text x="14" y="22.4" textAnchor="middle" fontSize="5.1" fontWeight="700" letterSpacing=".25" fill={accent}>PDF</text></g>
    case 'doc': return <g {...fine}><path d="M10.5 17h7m-7 2.5h7m-7 2.5h5"/><path d="M8.7 15.8v8.1" strokeWidth="1.8"/></g>
    case 'text': case 'file': return <g {...fine}><path d="M10.2 17h7.6m-7.6 2.5h7.6m-7.6 2.5h5.6"/></g>
    case 'markdown': return <g {...fine}><path d="M10.5 17.2h2.3l1.5 2 1.5-2h2.2v6h-2.2v-2.5l-1.5 1.8-1.5-1.8v2.5h-2.3z" fill={accent} stroke="none"/><path d="M10.5 25h7" stroke="#d9dce1" strokeWidth=".8"/></g>
    case 'code': return <g {...fine}><path d="m13 17-2.2 2.2L13 21.4m2-4.4 2.2 2.2-2.2 2.2m.4 2.6h-5"/></g>
    case 'sheet': return <g {...fine}><rect x="10" y="16.5" width="8" height="7" rx=".6" fill="#eef5f0"/><path d="M10 19h8m-8 2.3h8m-5.3-4.8v7"/></g>
    case 'slides': return <g {...fine}><rect x="10" y="16.5" width="8" height="6" rx=".7"/><path d="m13 18 2.7 1.5-2.7 1.5z" fill={accent} stroke="none"/><path d="M12 24.4h4"/></g>
    case 'image': return <g {...fine}><rect x="10" y="16.3" width="8.2" height="7" rx=".7"/><circle cx="12.5" cy="18.4" r=".8" fill={accent} stroke="none"/><path d="m10.8 22 2.4-2.1 1.5 1.2 1.4-1.4 1.5 2.3z" fill={accent} opacity=".75" stroke="none"/></g>
    case 'video': return <g {...fine}><rect x="10" y="16.5" width="8" height="6.2" rx=".8"/><path d="m13.1 18.1 3 1.6-3 1.6z" fill={accent} stroke="none"/><path d="M11.2 24.1h5.6"/></g>
    case 'audio': return <g fill={accent}><path d="M15.7 16v5.2a1.6 1.6 0 1 1-1.1-1.5v-3l4.2-1v5a1.6 1.6 0 1 1-1.1-1.5v-3.4z"/><path d="M10.5 24.5h7.3" fill="none" stroke="#d9dce1" strokeWidth=".8"/></g>
    case 'archive': return <g {...fine}><rect x="10" y="16.3" width="8" height="7.8" rx=".8"/><path d="M14 16.5v1.4m-.8 1.3h1.6m-.8 1.5h1.6m-.8 1.3h1.6" strokeWidth="1.4"/></g>
    case 'data': return <g {...fine}><path d="M12.3 16.8 10.5 20l1.8 3.2m3.4-6.4 1.8 3.2-1.8 3.2"/><path d="M10.5 25h7" stroke="#d9dce1" strokeWidth=".8"/></g>
    case 'font': return <g {...fine}><path d="m10.7 23.4 2.6-7h1.4l2.6 7m-5.8-2.1h5"/><path d="M10.5 25h7" stroke="#d9dce1" strokeWidth=".8"/></g>
    case 'executable': return <g {...fine}><circle cx="14" cy="20" r="3.5" fill="#eef1f2"/><path d="m13.2 18.4 2.6 1.6-2.6 1.6z" fill={accent} stroke="none"/></g>
    case 'app': return <g><rect x="10" y="16.5" width="8" height="7" rx="1.4" fill="#e8edf3" stroke="#aab6c4" strokeWidth=".7"/><circle cx="12.2" cy="18.5" r=".65" fill="#d78b83"/><circle cx="14" cy="18.5" r=".65" fill="#d4b56e"/><circle cx="15.8" cy="18.5" r=".65" fill="#83ab91"/><path d="M11.2 20.2h5.6v2h-5.6z" fill="#fafbfd" stroke="#c4ccd4" strokeWidth=".5"/></g>
    case 'config': return <g {...fine}><circle cx="14" cy="20" r="3"/><circle cx="14" cy="20" r="1"/><path d="M14 15.8v1m0 6.4v1m4.2-4.2h-1m-6.4 0h-1m7.2-3-.7.7m-4.6 4.6-.7.7m5.3 0-.7-.7m-4.6-4.6-.7-.7"/></g>
    case 'key': return <g {...fine}><circle cx="12.5" cy="19.5" r="2.1"/><path d="m14.3 21.2 3.3 3.2m-1.4-1.4 1.1-1.1m-.1 2.5 1.1-1.1"/></g>
    case 'disk': return <g {...fine}><ellipse cx="14" cy="17.8" rx="4" ry="1.6" fill="#edf0f3"/><path d="M10 17.8v4.3c0 .9 1.8 1.7 4 1.7s4-.8 4-1.7v-4.3" fill="#e2e7eb"/><path d="M10 20c0 .9 1.8 1.7 4 1.7s4-.8 4-1.7"/></g>
    default: return null
  }
}

function documentArtwork(kind: Kind): ReactNode {
  return (
    <g strokeLinejoin="round">
      <path d="M8.1 3.3h9.1l6.7 6.5v17.8c0 .9-.7 1.6-1.6 1.6H8.1c-.9 0-1.6-.7-1.6-1.6V4.9c0-.9.7-1.6 1.6-1.6" fill="#fcfcfd" stroke="#aeb8c4" strokeWidth=".9" />
      <path d="M17.1 3.7v5.8c0 .5.4.9.9.9h5.3" fill="#e6ebf0" stroke="#aeb8c4" strokeWidth=".8" />
      <path d="M18 4.6v4.2c0 .4.3.7.7.7h3.8" fill="none" stroke="#fff" strokeWidth=".7" opacity=".9" />
      <path d="M8.4 5.1v21.7c0 .6.4 1 1 1h12.4" fill="none" stroke="#fff" strokeWidth=".8" opacity=".75" />
      {kind === 'doc' || kind === 'text' || kind === 'file'
        ? <g stroke="#d5dbe2" strokeWidth=".8" strokeLinecap="round"><path d="M10 16.7h8"/><path d="M10 19.3h8"/><path d="M10 21.9h5.6"/></g>
        : null}
      <g transform="translate(-5.6 -8.2) scale(1.4)">{pageMark(kind)}</g>
    </g>
  )
}

function artwork(kind: Kind): ReactNode {
  if (SYS_DIRS.some(([folderKind]) => folderKind === kind) || kind === 'folder') return folderArtwork(kind)
  // These categories use their own object silhouettes instead of repeating a
  // paper sheet with a tiny glyph. The common 32px canvas scales cleanly in
  // both compact rows and the much larger card view.
  switch (kind) {
    case 'code':
      return <g strokeLinejoin="round"><rect x="3.5" y="5" width="25" height="22" rx="3" fill="#3d5369" stroke="#2b4054" /><path d="M4 11h24" stroke="#8093a5" strokeWidth=".8" /><circle cx="7.5" cy="8" r=".9" fill="#e19b91"/><circle cx="10.5" cy="8" r=".9" fill="#e0c17a"/><circle cx="13.5" cy="8" r=".9" fill="#92b99f"/><path d="m13 15-3 3 3 3m6-6 3 3-3 3m-1-7-2 8" fill="none" stroke="#e9eff4" strokeWidth="1.5" strokeLinecap="round"/></g>
    case 'sheet':
      return <g strokeLinejoin="round"><rect x="4" y="3.5" width="24" height="25" rx="2.5" fill="#579578" stroke="#3e795f"/><path d="M8 9h16M8 14h16M8 19h16M8 24h16M13 7v19M19 7v19" stroke="#e5f1e9" strokeWidth="1.3"/><path d="M5 8h3v6H5z" fill="#8fc3a1"/></g>
    case 'slides':
      return <g strokeLinejoin="round"><rect x="2.5" y="5" width="27" height="19" rx="2.5" fill="#d28b58" stroke="#a9673e"/><rect x="5.5" y="8" width="21" height="13" rx="1" fill="#fff8ef"/><path d="M10 27h12m-6-3v3" stroke="#9c694a" strokeWidth="1.6" strokeLinecap="round"/><path d="M9 17l4-4 3 2 3-3 4 5z" fill="#d6a16d"/><circle cx="21.5" cy="11" r="1.2" fill="#e8c375"/></g>
    case 'image':
      return <g strokeLinejoin="round"><rect x="3" y="4" width="26" height="24" rx="3" fill="#ba8090" stroke="#985d70"/><rect x="6" y="7" width="20" height="18" rx="1.5" fill="#f9edf0"/><circle cx="20.5" cy="11.5" r="2.2" fill="#e1b86c"/><path d="m7.5 22 6.3-7 3.5 3.6 2.5-2.4 4.7 5.8z" fill="#82aa92"/><path d="M7 25h18" stroke="#fff" strokeWidth=".8"/></g>
    case 'video':
      return <g strokeLinejoin="round"><rect x="3" y="5" width="26" height="22" rx="3" fill="#566c87" stroke="#3d5068"/><path d="M8 5v22m16-22v22" stroke="#dce4ec" strokeWidth="1.4" strokeDasharray="2 2"/><rect x="10" y="8" width="12" height="16" rx="1.5" fill="#f0f3f6"/><path d="m14 12 5 4-5 4z" fill="#647c99"/></g>
    case 'audio':
      return <g strokeLinejoin="round"><circle cx="16" cy="16" r="12.5" fill="#9a7baa" stroke="#765d89"/><circle cx="16" cy="16" r="8" fill="#c2add0"/><path d="M9 16h2l1.5-4 2.5 8 2.4-9 2 10 1.4-5H23" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="16" cy="16" r="1.5" fill="#80668f"/></g>
    case 'archive':
      return <g strokeLinejoin="round"><path d="M5 10h22l-1.5 16H6.5z" fill="#b49a6e" stroke="#8a7048"/><rect x="3" y="5" width="26" height="7" rx="1.5" fill="#d0b887" stroke="#9a8156"/><path d="M16 12v12m-1.5-9h3M14.5 18h3M14.5 21h3" stroke="#775f3e" strokeWidth="1.4"/><path d="M8 14h3" stroke="#ead9b7" strokeWidth="1.2"/></g>
    case 'pdf':
      return <g strokeLinejoin="round"><path d="M7 3h12l7 7v18H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2" fill="#fbf4f2" stroke="#aeb8c4"/><path d="M18 3v7h8" fill="#e9c9c4" stroke="#aeb8c4"/><path d="M6 14h20v8H6z" fill="#bd5b54"/><text x="16" y="20" textAnchor="middle" fontSize="5.8" fontWeight="800" letterSpacing=".4" fill="#fff">PDF</text><path d="M10 25h12" stroke="#d7c8c5" strokeWidth="1"/></g>
    case 'app': case 'applications':
      return <g strokeLinejoin="round"><rect x="3" y="3" width="26" height="26" rx="6" fill="#7787a1" stroke="#596b86"/><rect x="6" y="6" width="20" height="20" rx="3.5" fill="#eff2f6"/><circle cx="10" cy="10" r="1.3" fill="#d8817a"/><circle cx="16" cy="10" r="1.3" fill="#d5ae61"/><circle cx="22" cy="10" r="1.3" fill="#72a484"/><path d="M9 15h14v8H9z" fill="#b8c5d3"/><path d="M11 18h10M11 20.5h6" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></g>
    case 'key':
      return <g strokeLinejoin="round" fill="#c19d58" stroke="#8c6e38" strokeWidth="1.1"><circle cx="10.5" cy="12" r="6.5"/><circle cx="10.5" cy="12" r="2.2" fill="#f3e8ce"/><path d="m15 16 11 11 3-3-2.7-2.7 2-2-3-3-2 2-4.5-4.5z"/></g>
    case 'font':
      return <g strokeLinejoin="round"><path d="m4 26 9-21h5l10 21h-5l-2.2-5H11l-2 5z" fill="#927fa6" stroke="#6d5c80"/><path d="M12.7 17h6.2l-3.2-7z" fill="#f5f0f8"/><path d="M5 28h23" stroke="#6d5c80" strokeWidth="1.2"/></g>
    case 'disk':
      return <g strokeLinejoin="round"><rect x="4" y="4" width="24" height="24" rx="3" fill="#718395" stroke="#526579"/><path d="M8 5h15v8H8z" fill="#dce4eb"/><path d="M9 18h14v8H9z" fill="#f1f4f6" stroke="#b2bec9"/><circle cx="16" cy="22" r="2.5" fill="#8b9aaa"/><path d="M11 8h8" stroke="#8c9cac" strokeWidth="1.3"/></g>
    case 'executable':
      return <g strokeLinejoin="round"><circle cx="16" cy="16" r="12" fill="#82958a" stroke="#5c7568"/><circle cx="16" cy="16" r="8" fill="#e9f0eb"/><path d="m14 11 7 5-7 5z" fill="#608272"/><path d="M7 28h18" stroke="#526c5f" strokeWidth="1.2"/></g>
    case 'data':
      return <g strokeLinejoin="round"><rect x="3" y="4" width="26" height="24" rx="4" fill="#55928e" stroke="#39736f"/><path d="m12 10-5 6 5 6m8-12 5 6-5 6m-3-14-3 16" fill="none" stroke="#f2fbfa" strokeWidth="1.8" strokeLinecap="round"/></g>
    case 'config':
      return <g strokeLinejoin="round"><path d="m13 3 6 0 1 3.2 2.7 1.6 3.1-1.1 3 5.2-2.3 2.4v3.2l2.3 2.4-3 5.2-3.1-1.1-2.7 1.6-1 3.2h-6l-1-3.2-2.7-1.6-3.1 1.1-3-5.2L5.5 19v-3.2l-2.3-2.4 3-5.2 3.1 1.1L12 7.7z" transform="translate(0 -1) scale(.94) translate(1 1)" fill="#b29a61" stroke="#877345"/><circle cx="16" cy="16" r="5.5" fill="#f4efdf" stroke="#877345" strokeWidth="1.4"/><circle cx="16" cy="16" r="2" fill="#b29a61"/></g>
    default:
      break
  }
  return documentArtwork(kind)
}

export function FileIcon({ entry, size = 'row' }: { entry: FileEntry; size?: 'row' | 'card' }) {
  const kind = kindOf(entry)
  return (
    <div className={`flex shrink-0 items-center justify-center ${size === 'card' ? 'h-20 w-20' : 'h-8 w-8'}`}>
      <svg
        viewBox="0 0 32 32"
        className={size === 'card' ? 'h-[76px] w-[76px]' : 'h-7 w-7'}
        style={{ filter: 'drop-shadow(0 1px 1px rgba(35, 45, 58, .2))' }}
        role="img"
        aria-label={kind}
        data-icon-kind={kind}
      >
        {artwork(kind)}
      </svg>
    </div>
  )
}
