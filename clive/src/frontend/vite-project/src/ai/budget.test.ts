import { describe, it, expect } from 'vitest'
import { budgetFiles, looksLikeText, renderBudgeted, type FileContent } from './budget'

function file(path: string, text: string | null, over: Partial<FileContent> = {}): FileContent {
  const name = path.split('/').pop()!
  return { path, name, isDir: false, size: text ? text.length : 0, text, ...over }
}

describe('looksLikeText', () => {
  it('accepts plain text and rejects NUL bytes', () => {
    expect(looksLikeText('hello world\nline two')).toBe(true)
    expect(looksLikeText('bin\u0000ary')).toBe(false)
  })
})

describe('budgetFiles', () => {
  it('passes small text through untruncated', () => {
    const out = budgetFiles([file('/a/x.txt', 'short content')])
    expect(out[0].truncated).toBe(false)
    expect(out[0].body).toBe('short content')
  })

  it('truncates oversized text with a marker and stays within the per-file cap', () => {
    const big = 'a'.repeat(5000)
    const out = budgetFiles([file('/a/big.txt', big)], { perFileBytes: 200 })
    expect(out[0].truncated).toBe(true)
    expect(out[0].body).toContain('[troncato]')
    expect(new TextEncoder().encode(out[0].body).length).toBeLessThanOrEqual(200)
  })

  it('reduces dirs and binary to metadata only', () => {
    const out = budgetFiles([
      file('/a/dir', null, { isDir: true }),
      file('/a/bin.bin', 'x\u0000y\u0000z'),
    ])
    expect(out[0].body).toContain('[dir')
    expect(out[1].body).toContain('[bin')
    expect(out[1].note).toBe('metadata only')
  })

  it('enforces the total budget across files', () => {
    const mk = (n: number) => file(`/a/f${n}.txt`, 'b'.repeat(100))
    const out = budgetFiles(Array.from({ length: 5 }, (_, i) => mk(i)), {
      perFileBytes: 1000,
      totalBytes: 250,
    })
    const total = out.reduce((s, b) => s + new TextEncoder().encode(b.body).length, 0)
    expect(total).toBeLessThanOrEqual(250)
    // later files should be starved
    expect(out[4].body).toBe('')
    expect(out[4].note).toContain('exhausted')
  })
})

describe('renderBudgeted', () => {
  it('labels each block with its name', () => {
    const s = renderBudgeted([
      { path: '/a/x.txt', name: 'x.txt', body: 'hi', truncated: false },
    ])
    expect(s).toContain('### x.txt')
    expect(s).toContain('hi')
  })
})

import { renderPlanSignature, type FileEntry } from './budget.js'
const fe = (name: string, isDir = false): FileEntry =>
  ({ name, path: `/r/${name}`, isDir, size: 1, modified: 0, extension: null }) as FileEntry

describe('renderPlanSignature', () => {
  it('summarizes counts, extensions, folders and a name sample (compact)', () => {
    const s = renderPlanSignature([fe('a.pdf'), fe('b.pdf'), fe('img.jpeg'), fe('sub', true)])
    expect(s).toContain('4 items total')
    expect(s).toContain('1 folders')
    expect(s).toContain('.pdf:2')
    expect(s).toContain('sub/')
    expect(s).toContain('a.pdf')
    // stays small even for many entries
    const big = Array.from({ length: 500 }, (_, i) => fe(`f${i}.log`))
    expect(renderPlanSignature(big).length).toBeLessThan(800)
  })
})
