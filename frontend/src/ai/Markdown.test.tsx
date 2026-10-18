// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { Markdown } from './Markdown.js'

afterEach(cleanup)

describe('Markdown', () => {
  it('renders headings, lists, quotes, tables, strikethrough, and fenced code', () => {
    const { container } = render(<Markdown text={'# Title\n## Section\n### Detail\n#### Minor\n\n- one\n- ~~two~~\n\n1. first\n2. second\n\n> quoted\n\n---\n\n| A | B |\n| - | - |\n| x | y |\n\n```ts\nconst value = 1\n```'} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Title')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Section')
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Detail')
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Minor')
    expect(container.querySelectorAll('ul li')).toHaveLength(2)
    expect(container.querySelectorAll('ol li')).toHaveLength(2)
    expect(container.querySelector('blockquote')).toHaveTextContent('quoted')
    expect(container.querySelector('table')).toBeInTheDocument()
    expect(container.querySelector('del')).toHaveTextContent('two')
    expect(container.querySelector('pre code')).toHaveClass('language-ts')
    expect(container.querySelector('hr')).toBeInTheDocument()
  })

  it('renders inline code and emphasis while omitting raw HTML', () => {
    const { container } = render(<Markdown text={'A **bold** and _italic_ `code`. <img src=x onerror=alert(1) />'} />)
    expect(container.querySelector('strong')).toHaveTextContent('bold')
    expect(container.querySelector('em')).toHaveTextContent('italic')
    expect(container.querySelector('code')).toHaveClass('rounded')
    expect(container.querySelector('img')).toBeNull()
  })

  it('opens links externally and swallows a failed native open request', async () => {
    vi.mocked(invoke).mockResolvedValue(null as never)
    render(<Markdown text="[Clive](https://example.test/path)" />)
    const link = screen.getByRole('link', { name: 'Clive' })
    expect(link).toHaveAttribute('target', '_blank')
    fireEvent.click(link)
    expect(invoke).toHaveBeenCalledWith('open_path', { path: 'https://example.test/path' })

    vi.mocked(invoke).mockRejectedValueOnce(new Error('no handler'))
    fireEvent.click(link)
    await Promise.resolve()
  })
})
