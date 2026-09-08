import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { openPath } from '../api'

/**
 * Compact Markdown renderer for chat bubbles (react-markdown + GFM: tables,
 * strikethrough, task lists, fenced code). No raw-HTML path (skipHtml), so
 * the Tauri webview / CSP surface stays closed. Links never navigate the
 * webview: we intercept the click and hand the URL to `openPath` (the
 * existing Tauri "open with default app" command), which launches it
 * externally.
 */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          h1: ({ children }) => <h1 className="mb-1 mt-2 text-sm font-bold">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-1 mt-2 text-[13px] font-bold">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1 mt-1 text-xs font-bold">{children}</h3>,
          h4: ({ children }) => <h4 className="mb-1 mt-1 text-xs font-semibold">{children}</h4>,
          p: ({ children }) => <p className="my-1 first:mt-0 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="my-1 list-disc pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-1 list-decimal pl-5">{children}</ol>,
          li: ({ children }) => <li className="my-0.5">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="link link-primary break-words"
              onClick={(e) => {
                e.preventDefault()
                const url = (e.currentTarget as HTMLAnchorElement).href
                if (url) void openPath(url).catch(() => {})
              }}
            >
              {children}
            </a>
          ),
          code: ({ className, children }) => {
            const isBlock = /language-/.test(className ?? '') || String(children).includes('\n')
            if (isBlock) {
              return (
                <code className={className}>{children}</code>
              )
            }
            return (
              <code className="rounded bg-base-300 px-1 py-0.5 text-[11px]">{children}</code>
            )
          },
          pre: ({ children }) => (
            <pre className="my-1 overflow-x-auto rounded bg-base-300 p-2 text-xs">{children}</pre>
          ),
          table: ({ children }) => (
            <div className="my-1 overflow-x-auto">
              <table className="my-0 border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-base-300 px-2 py-1 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border border-base-300 px-2 py-1">{children}</td>,
          blockquote: ({ children }) => (
            <blockquote className="my-1 border-l-2 border-base-300 pl-2 italic opacity-80">{children}</blockquote>
          ),
          del: ({ children }) => <del className="line-through">{children}</del>,
          hr: () => <hr className="my-2 border-base-300" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
