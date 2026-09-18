// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import i18n from './i18n'
import { FileList } from './FileList'
import type { FileEntry } from './api'

const files = ['a', 'b', 'c'].map((n) => ({ name: n, path: `/d/${n}`, isDir: false, size: 1, modified: 0, extension: null })) as unknown as FileEntry[]

const rectOf = (x: number, y: number, w: number, h: number) =>
  ({ x, y, width: w, height: h, top: y, left: x, bottom: y + h, right: x + w, toJSON() {} }) as DOMRect

// This jsdom lacks PointerEvent: testing-library's pointer helpers build a bare Event
// without clientX/button. Dispatch a MouseEvent with the pointer* type instead, which
// React normalizes into the onPointer* handlers with working clientX/button.
const fireMouse = (target: Element, type: string, init: MouseEventInit) => {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(ev)
}

beforeEach(async () => {
  cleanup()
  await i18n.changeLanguage('en')
})
afterEach(() => cleanup())

const renderList = (onMarqueeSelect: (paths: string[], additive: boolean) => void) =>
  render(
    <FileList
      paneId="left" files={files} selected={new Set()} renamingPath={null} view="list"
      sort={{ key: 'name', dir: 1 }} onSortChange={vi.fn()} onItemClick={vi.fn()} onItemDoubleClick={vi.fn()}
      onRenameConfirm={vi.fn()} onRenameCancel={vi.fn()} onItemContextMenu={vi.fn()}
      onMarqueeSelect={onMarqueeSelect}
    />,
  )

// container 300x200; rows at y = 0/30/60, height 20
const stubRects = () => {
  const scroll = document.querySelector('.scroll-area') as HTMLElement
  scroll.getBoundingClientRect = () => rectOf(0, 0, 300, 200)
  const rows = [...document.querySelectorAll<HTMLElement>('[data-file-path]')]
  rows.forEach((r, i) => {
    r.getBoundingClientRect = () => rectOf(0, i * 30, 300, 20)
  })
  return { scroll, rows }
}

describe('FileList rubber-band', () => {
  it('marquee on empty space replaces the selection with crossed rows', () => {
    const onMarquee = vi.fn()
    renderList(onMarquee)
    const { scroll } = stubRects()
    fireMouse(scroll, 'pointerdown', { button: 0, clientX: 150, clientY: 5 })
    fireMouse(scroll, 'pointermove', { clientX: 150, clientY: 65 })
    fireMouse(scroll, 'pointerup', { clientX: 150, clientY: 65 })
    expect(onMarquee).toHaveBeenCalledWith(['/d/a', '/d/b', '/d/c'], false)
  })

  it('modifier held on release makes the marquee additive', () => {
    const onMarquee = vi.fn()
    renderList(onMarquee)
    const { scroll } = stubRects()
    fireMouse(scroll, 'pointerdown', { button: 0, clientX: 150, clientY: 32 })
    fireMouse(scroll, 'pointermove', { clientX: 150, clientY: 48 })
    fireMouse(scroll, 'pointerup', { clientX: 150, clientY: 48, ctrlKey: true })
    expect(onMarquee).toHaveBeenCalledWith(['/d/b'], true)
  })

  it('starting on a row does not open a marquee', () => {
    const onMarquee = vi.fn()
    renderList(onMarquee)
    const { rows } = stubRects()
    const scroll = document.querySelector('.scroll-area') as HTMLElement
    fireMouse(rows[0], 'pointerdown', { button: 0, clientX: 10, clientY: 5 })
    fireMouse(scroll, 'pointermove', { clientX: 10, clientY: 90 })
    fireMouse(scroll, 'pointerup', { clientX: 10, clientY: 90 })
    expect(onMarquee).not.toHaveBeenCalled()
  })
})
