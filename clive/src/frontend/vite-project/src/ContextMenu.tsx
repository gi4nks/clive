import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export interface MenuItem {
  key: string
  label?: string
  icon?: ReactNode
  hint?: string
  onSelect?: () => void
  disabled?: boolean
  danger?: boolean
  separator?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const pad = 8
    let left = x
    let top = y
    if (left + width > window.innerWidth - pad) left = Math.max(pad, x - width)
    if (top + height > window.innerHeight - pad) top = Math.max(pad, y - height)
    setPos({ left, top })
  }, [x, y])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    window.addEventListener('wheel', onClose, { passive: true, capture: true })
    window.addEventListener('scroll', onClose, { passive: true, capture: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('wheel', onClose, { capture: true })
      window.removeEventListener('scroll', onClose, { capture: true })
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50"
      onMouseDown={onClose}
      onContextMenu={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div
        ref={ref}
        className="menu menu-sm fixed min-w-52 rounded-lg border border-base-300 bg-base-100/95 p-1 text-[13px] shadow-2xl ring-1 ring-black/5 backdrop-blur-xl"
        style={{ left: pos.left, top: pos.top }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {items.map((it) =>
          it.separator ? (
            <li key={it.key} className="my-1 h-px bg-base-300" aria-hidden />
          ) : (
            <li key={it.key}>
              <button
                disabled={it.disabled}
                className={it.danger ? 'text-error' : ''}
                onClick={() => {
                  it.onSelect?.()
                  onClose()
                }}
              >
                {it.icon}
                <span className="flex-1 text-left">{it.label}</span>
                {it.hint && <span className="ml-4 text-xs opacity-50">{it.hint}</span>}
              </button>
            </li>
          ),
        )}
      </div>
    </div>
  )
}
