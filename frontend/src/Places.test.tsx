// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Places } from './Places'
import './i18n'

describe('Places', () => {
  it('shows standard locations and recent paths with navigation and context actions', () => {
    const onNavigate = vi.fn()
    const onClearRecents = vi.fn()
    const onItemContextMenu = vi.fn()
    render(<Places
      home="/Users/test"
      currentPath="/Users/test/Documents"
      recents={['/Users/test/Projects', '/Volumes/External']}
      onNavigate={onNavigate}
      onClearRecents={onClearRecents}
      onItemContextMenu={onItemContextMenu}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Documents' }))
    expect(onNavigate).toHaveBeenCalledWith('/Users/test/Documents')
    fireEvent.contextMenu(screen.getByRole('button', { name: '/Volumes/External' }), { clientX: 7, clientY: 9 })
    expect(onItemContextMenu).toHaveBeenCalledWith('recent', 'External', '/Volumes/External', 7, 9)
    fireEvent.click(screen.getByRole('button', { name: 'Clear recent' }))
    expect(onClearRecents).toHaveBeenCalledOnce()
  })

  it('handles an unknown current path and empty home/recents', () => {
    const { container, rerender } = render(<Places home="" currentPath="/other" recents={[]} onNavigate={vi.fn()} onClearRecents={vi.fn()} onItemContextMenu={vi.fn()} />)
    expect(screen.getByText('No recent locations')).toBeInTheDocument()
    expect(container.querySelectorAll('aside button')).toHaveLength(0)
    rerender(<Places home="/Users/test" currentPath="/elsewhere" recents={['/tmp/report']} onNavigate={vi.fn()} onClearRecents={vi.fn()} onItemContextMenu={vi.fn()} />)
    expect(screen.getByRole('button', { name: '/tmp/report' })).toBeInTheDocument()
  })
})
