// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  EmptyFolderIllustration,
  UiIcon,
  placeIconName,
  volumeIconName,
  type UiIconName,
} from './UiIcons'

describe('UiIcons', () => {
  it('renders every UI icon name as an aria-hidden SVG', () => {
    const names: UiIconName[] = [
      'home', 'desktop', 'documents', 'downloads', 'pictures', 'music', 'movies',
      'folder', 'file', 'pin', 'clock', 'internalDisk', 'externalDisk', 'networkGlobe',
      'cloud', 'eject', 'disconnect', 'chevronRight', 'chevronLeft', 'chevronDown',
      'chevronUp', 'sortAsc', 'sortDesc', 'plus', 'close', 'moreHorizontal',
      'chatBubble', 'wand', 'sparkles', 'renameAction', 'organizeAction',
      'newFolderAction', 'trashAction', 'warning', 'wrench', 'scissors', 'copy', 'check',
    ]
    for (const name of names) {
      const { container, unmount } = render(<UiIcon name={name} />)
      const svg = container.querySelector('svg')
      expect(svg).not.toBeNull()
      expect(svg).toHaveAttribute('aria-hidden', 'true')
      expect((svg?.innerHTML ?? '').length).toBeGreaterThan(10)
      unmount()
    }
  })

  it('maps standard place keys and volume kinds to icons', () => {
    expect(placeIconName('home')).toBe('home')
    expect(placeIconName('desktop')).toBe('desktop')
    expect(placeIconName('documents')).toBe('documents')
    expect(placeIconName('downloads')).toBe('downloads')
    expect(placeIconName('pictures')).toBe('pictures')
    expect(placeIconName('music')).toBe('music')
    expect(placeIconName('movies')).toBe('movies')
    expect(placeIconName('custom')).toBe('folder')

    expect(volumeIconName('internal')).toBe('internalDisk')
    expect(volumeIconName('network')).toBe('networkGlobe')
    expect(volumeIconName('external')).toBe('externalDisk')
  })

  it('renders the empty folder illustration', () => {
    const { container } = render(<EmptyFolderIllustration />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })
})
