import { describe, expect, it } from 'vitest'
import { describeLocation, volumeForPath } from './location.js'
import type { Volume } from './api.js'

const volumes: Volume[] = [
  { name: 'Macintosh HD', mountPoint: '/', device: '/dev/disk3s1', totalBytes: 100, usedBytes: 50, freeBytes: 50, kind: 'internal', ejectable: false },
  { name: 'NAS', mountPoint: '/Volumes/NAS', device: '//nas/share', totalBytes: 100, usedBytes: 50, freeBytes: 50, kind: 'network', ejectable: true },
  { name: 'USB', mountPoint: '/Volumes/USB', device: '/dev/disk5s1', totalBytes: 100, usedBytes: 50, freeBytes: 50, kind: 'external', ejectable: true },
]

describe('location model', () => {
  it('does not classify an absent mount as the internal disk', () => {
    expect(describeLocation('/Volumes/Missing/docs', volumes)).toMatchObject({ kind: 'unknown', online: false })
    expect(describeLocation('/Volumes/NAS-other', volumes)).toMatchObject({ kind: 'unknown', online: false })
  })
  it('resolves the deepest mounted volume', () => {
    expect(volumeForPath('/Volumes/NAS/Projects', volumes)?.name).toBe('NAS')
  })

  it('classifies a mounted network share', () => {
    expect(describeLocation('/Volumes/NAS/Projects', volumes)).toMatchObject({ kind: 'network', online: true, volumeName: 'NAS' })
  })

  it('classifies local and external mounts', () => {
    expect(describeLocation('/Users/demo', volumes).kind).toBe('local')
    expect(describeLocation('/Volumes/USB', volumes).kind).toBe('external')
  })

  it('does not interpret remote URLs as filesystem paths', () => {
    expect(describeLocation('smb://nas.local/share', volumes)).toMatchObject({ kind: 'unknown', online: false })
  })
})
