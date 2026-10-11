// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import i18n from './i18n'

const mocks = vi.hoisted(() => ({
  readTextFile: vi.fn(async () => '# hi **bold**'),
  readFileBytes: vi.fn(async () => btoa('IMG')),
  quickLook: vi.fn(async () => undefined),
  openPath: vi.fn(async () => undefined),
}))

vi.mock('./api', async (io) => ({ ...(await io<typeof import('./api')>()), ...mocks }))
vi.mock('./childCount', () => ({ getChildCount: async () => ({ state: 'ok', total: 7, hasSubdirs: true }) }))

import { PreviewPanel } from './PreviewPanel'
import type { FileEntry } from './api'

const file = (name: string, isDir = false): FileEntry => ({ name, path: `/f/${name}`, isDir, size: 1234, modified: 0, extension: null })

function ExpandablePreviewHarness() {
  const [expanded, setExpanded] = useState(false)
  return <PreviewPanel selection={[]} expanded={expanded} onToggleExpanded={() => setExpanded((value) => !value)} />
}

beforeEach(async () => {
  cleanup()
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:fake')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  mocks.readTextFile.mockClear(); mocks.readFileBytes.mockClear()
  await i18n.changeLanguage('en')
})
afterEach(() => cleanup())

describe('PreviewPanel', () => {
  it('shows the empty hint with no selection', () => {
    render(<PreviewPanel selection={[]} />)
    expect(screen.getByText('Select a file to preview it')).toBeInTheDocument()
    expect(mocks.readFileBytes).not.toHaveBeenCalled()
  })

  it('expands to fill the workspace and restores its normal width', () => {
    render(<ExpandablePreviewHarness />)
    const panel = screen.getByRole('region', { name: 'Preview' })

    expect(panel).toHaveClass('w-[22rem]', 'shrink-0')
    fireEvent.click(screen.getByRole('button', { name: 'Expand preview and minimize both file panes' }))
    expect(panel).toHaveClass('flex-1')
    expect(panel).not.toHaveClass('w-[22rem]', 'shrink-0')

    fireEvent.click(screen.getByRole('button', { name: 'Restore pane layout' }))
    expect(panel).toHaveClass('w-[22rem]', 'shrink-0')
  })

  it('renders an image preview from blob bytes', async () => {
    render(<PreviewPanel selection={[file('photo.png')]} />)
    await waitFor(() => expect(screen.getByRole('img', { name: 'photo.png' })).toHaveAttribute('src', 'blob:fake'))
  })

  it('renders markdown as formatted HTML for .md files', async () => {
    render(<PreviewPanel selection={[file('README.md')]} />)
    await waitFor(() => expect(screen.getByText('hi').querySelector('strong') ?? document.querySelector('[data-preview-panel] strong')).not.toBeNull())
    expect(mocks.readFileBytes).not.toHaveBeenCalled()
  })

  it('falls back to Quick Look card for unknown types and folder counts children', async () => {
    const { rerender } = render(<PreviewPanel selection={[file('a.zip')]} />)
    await waitFor(() => expect(document.querySelector('[data-preview-fallback]')).not.toBeNull())
    rerender(<PreviewPanel selection={[file('docs', true)]} />)
    await waitFor(() => expect(screen.getByText('7 items')).toBeInTheDocument())
  })

  it('summarizes multi-selection and previews the last entry', async () => {
    render(<PreviewPanel selection={[file('a.png'), file('b.png')]} />)
    await waitFor(() => expect(screen.getByText('2 selected')).toBeInTheDocument())
    await waitFor(() => expect(document.querySelector('img[alt="b.png"]')).not.toBeNull())
  })
})
