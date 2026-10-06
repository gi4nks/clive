import type { PointerEvent as ReactPointerEvent } from 'react'

/**
 * A clearly visible, theme-adaptive vertical drag handle used for resizing
 * (the dual-pane split, the sidebar, and list-view columns). Colors use
 * `base-content` with alpha so the grip is visible in both light and dark
 * themes, and highlights on hover/drag.
 *
 * The base element only sets the interaction affordances + full height; the
 * caller positions it (static flex child vs `absolute` inside a header cell)
 * and supplies sizing via `className`.
 */
export function SplitHandle({
  onPointerDown,
  onPointerMove,
  onPointerUp,
  label,
  className = '',
}: {
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onPointerMove?: (e: ReactPointerEvent<HTMLDivElement>) => void
  onPointerUp?: () => void
  label?: string
  className?: string
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={`group relative z-10 h-full cursor-col-resize touch-none ${className}`}
    >
      <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-base-content/25 transition-colors group-hover:bg-primary group-active:bg-primary" />
      <span className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-[3px]">
        <span className="h-[3px] w-[3px] rounded-full bg-base-content/50 transition-colors group-hover:bg-primary" />
        <span className="h-[3px] w-[3px] rounded-full bg-base-content/50 transition-colors group-hover:bg-primary" />
        <span className="h-[3px] w-[3px] rounded-full bg-base-content/50 transition-colors group-hover:bg-primary" />
      </span>
    </div>
  )
}
