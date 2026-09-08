import { useEffect, useRef, useState, type ReactNode } from 'react'

interface PopoverProps {
  /** Content rendered inside the trigger button. */
  label: ReactNode
  buttonTitle?: string
  buttonClassName?: string
  /** Tailwind width/positioning classes for the floating panel. */
  panelClassName?: string
  align?: 'left' | 'center' | 'right'
  disabled?: boolean
  /** Fired each time the popover opens (e.g. to fetch on-demand data). */
  onOpen?: () => void
  /** Optional controlled open state (so menus can close after an action). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}

/**
 * Reusable popover that floats above the status bar. Opens on click, closes on
 * outside pointerdown, Escape, or window blur. It ignores scroll/wheel events
 * that originate inside the panel, so long lists (e.g. Trash) can be scrolled
 * without dismissing the popover.
 */
export function Popover({
  label,
  buttonTitle,
  buttonClassName = '',
  panelClassName = '',
  align = 'center',
  disabled = false,
  onOpen,
  open: openProp,
  onOpenChange,
  children,
}: PopoverProps) {
  const [internal, setInternal] = useState(false)
  const controlled = openProp !== undefined
  const open = controlled ? openProp : internal
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const setOpen = (next: boolean) => {
    if (!controlled) setInternal(next)
    onOpenChange?.(next)
  }

  const toggle = () => {
    if (disabled) return
    const next = !open
    setOpen(next)
    if (next) onOpen?.()
  }

  useEffect(() => {
    if (!open) return
    const inPanel = (node: EventTarget | null) =>
      !!node && node instanceof Node && !!panelRef.current?.contains(node)

    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        rootRef.current?.querySelector('button')?.blur()
      }
    }
    const onScroll = (e: Event) => {
      if (!inPanel(e.target)) setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    window.addEventListener('wheel', onScroll, { passive: true, capture: true })
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('wheel', onScroll, { capture: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, controlled])

  const alignClass =
    align === 'right' ? 'right-0' : align === 'left' ? 'left-0' : 'left-1/2 -translate-x-1/2'

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        data-bar-control
        aria-expanded={open}
        title={buttonTitle}
        disabled={disabled}
        onClick={toggle}
        className={`btn btn-ghost btn-xs !h-7 !min-h-0 gap-1 rounded-md px-2 ${buttonClassName}`}
      >
        {label}
      </button>
      {open && (
        <div
          ref={panelRef}
          role="group"
          className={`absolute bottom-full z-50 mb-1 rounded-box border border-base-300 bg-base-100 p-2 text-base-content shadow-xl ${alignClass} ${panelClassName}`}
        >
          {children}
        </div>
      )}
    </div>
  )
}
