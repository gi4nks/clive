// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import i18n from './i18n'
import { PaneRail } from './PaneRail'

beforeEach(async () => {
  cleanup()
  await i18n.changeLanguage('en')
})

describe('PaneRail', () => {
  it('shows the folder basename and expands on click', () => {
    const onExpand = vi.fn()
    render(<PaneRail id="left" path="/u/x/Downloads" home="/u/x" active={false} onExpand={onExpand} />)
    expect(screen.getByText('Downloads')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    expect(onExpand).toHaveBeenCalledWith('left')
  })
  it('uses "Home" when path is home', () => {
    render(<PaneRail id="right" path="/u/x" home="/u/x" active onExpand={vi.fn()} />)
    expect(screen.getByText('Home')).toBeInTheDocument()
  })
})
