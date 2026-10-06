// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { previewKind, usesBytes, usesText, truncateLines, newLoadToken, usePreview } from './preview'

vi.mock('./api', async (io) => {
  const actual = await io<typeof import('./api')>()
  return {
    ...actual,
    readTextFile: vi.fn(async () => 'line1\nline2'),
    readFileBytes: vi.fn(async () => btoa('IMGDATA')),
  }
})
import { readTextFile, readFileBytes } from './api'

describe('previewKind', () => {
  it('maps content types', () => {
    expect(previewKind('photo.HEIC')).toBe('image')
    expect(previewKind('clip.mp4')).toBe('video')
    expect(previewKind('doc.pdf')).toBe('pdf')
    expect(previewKind('README.md')).toBe('markdown')
    expect(previewKind('main.rs')).toBe('text')
    expect(previewKind('archive.zip')).toBe('fallback')
    expect(previewKind('noext')).toBe('fallback')
    expect(previewKind('dir', true)).toBe('folder')
  })
  it('routes bytes vs text', () => {
    expect(usesBytes('image') && usesBytes('pdf') && !usesBytes('markdown')).toBe(true)
    expect(usesText('text') && !usesText('image')).toBe(true)
  })
})

describe('helpers', () => {
  it('truncateLines caps and flags', () => {
    const big = Array.from({ length: 6000 }, (_, i) => `l${i}`).join('\n')
    const r = truncateLines(big, 5000)
    expect(r.text.split('\n')).toHaveLength(5000)
    expect(r.truncated).toBe(true)
    expect(truncateLines('a\nb', 5)).toEqual({ text: 'a\nb', truncated: false })
  })
  it('newLoadToken increments monotonically', () => {
    const ref = { current: 0 }
    expect(newLoadToken(ref)).toBe(1)
    expect(newLoadToken(ref)).toBe(2)
  })
})

describe('usePreview', () => {
  let createSpy: ReturnType<typeof vi.spyOn>
  let revokeSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    createSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:fake')
    revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.mocked(readFileBytes).mockClear()
    vi.mocked(readTextFile).mockClear()
  })
  afterEach(() => cleanup())

  const target = (name: string, path = `/f/${name}`, isDir = false, size = 10) => ({ path, name, isDir, size })

  it('debounces and loads bytes for images into a blob url', async () => {
    const { result, rerender } = renderHook(({ t }) => usePreview(t), { initialProps: { t: target('a.png') } })
    rerender({ t: target('a.png') }) // rapid re-selection should not double-load within the debounce
    expect(result.current.error).toBe(null) // nothing loaded before the debounce
    await waitFor(() => expect(result.current.kind).toBe('image'))
    expect(result.current.url).toBeTruthy()
    expect(readFileBytes).toHaveBeenCalledTimes(1)
  })

  it('loads text kinds through readTextFile only', async () => {
    const { result } = renderHook(() => usePreview(target('x.rs')))
    await waitFor(() => expect(result.current.kind).toBe('text'))
    expect(result.current.text).toBe('line1\nline2')
    expect(readFileBytes).not.toHaveBeenCalled()
  })

  it('fallback kinds never touch the byte commands', async () => {
    const { result } = renderHook(() => usePreview(target('a.zip')))
    await waitFor(() => expect(result.current.kind).toBe('fallback'))
    expect(readFileBytes).not.toHaveBeenCalled()
    expect(readTextFile).not.toHaveBeenCalled()
  })

  it('too-large surfaces a specific error', async () => {
    vi.mocked(readFileBytes).mockRejectedValueOnce('too-large:99999999')
    const { result } = renderHook(() => usePreview(target('big.mov')))
    await waitFor(() => expect(result.current.error).toBe('too-large'))
    expect(result.current.kind).toBe('fallback')
  })

  it('revokes the previous blob url when the selection changes', async () => {
    const { result, rerender } = renderHook(({ t }) => usePreview(t), { initialProps: { t: target('one.png') } })
    await waitFor(() => expect(result.current.url).toBeTruthy())
    rerender({ t: target('two.png') })
    await waitFor(() => expect(result.current.path).toBe('/f/two.png'))
    expect(revokeSpy).toHaveBeenCalledWith('blob:fake')
  })
})
