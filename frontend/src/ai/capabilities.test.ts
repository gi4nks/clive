import { describe, it, expect } from 'vitest'
import { modelCapabilities, isImageName, visionGate } from './capabilities'

describe('modelCapabilities', () => {
  it('flags vision models and a large context', () => {
    const c = modelCapabilities('llava:13b')
    expect(c.supportsVision).toBe(true)
    expect(c.maxContextTokens).toBeGreaterThanOrEqual(DEFAULT)
  })
  it('detects qwen2.5-vl style ids', () => {
    expect(modelCapabilities('qwen2.5-vl:7b').supportsVision).toBe(true)
  })
  it('treats plain llama/qwen text models as non-vision', () => {
    const c = modelCapabilities('llama3.2:3b')
    expect(c.supportsVision).toBe(false)
    expect(c.maxContextTokens).toBe(128_000)
  })
  it('defaults small unknown models', () => {
    const c = modelCapabilities('mystery-model')
    expect(c.supportsVision).toBe(false)
    expect(c.maxContextTokens).toBe(8_192)
  })
})

describe('isImageName', () => {
  it('matches by extension arg or name', () => {
    expect(isImageName('a', 'png')).toBe(true)
    expect(isImageName('b.JPG')).toBe(true)
    expect(isImageName('c.txt', 'txt')).toBe(false)
  })
})

describe('visionGate', () => {
  const noVision = { supportsVision: false, maxContextTokens: 8192 }
  const vision = { supportsVision: true, maxContextTokens: 8192 }

  it('allows everything when the model has vision', () => {
    const g = visionGate([{ name: 'a.png' }, { name: 'b.txt' }], vision)
    expect(g).toMatchObject({ imagesSkipped: 0, blocked: false, note: null })
  })

  it('notes skipped images on mixed selection', () => {
    const g = visionGate([{ name: 'a.png' }, { name: 'b.txt' }], noVision)
    expect(g.imagesSkipped).toBe(1)
    expect(g.blocked).toBe(false)
    expect(g.note).toContain('ignor')
  })

  it('blocks a fully-image selection with no vision', () => {
    const g = visionGate([{ name: 'a.png' }, { name: 'b.jpg' }], noVision)
    expect(g.blocked).toBe(true)
    expect(g.imagesSkipped).toBe(2)
  })
})

const DEFAULT = 8_192
