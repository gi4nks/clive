import { describe, it, expect } from 'vitest'
import { isProtectedPath, blockDestructive, normalizeForGuard } from './systemGuard'

describe('normalizeForGuard', () => {
  it('root', () => expect(normalizeForGuard('/')).toBe('/'))
  it('strips trailing slash + dots, resolves .., lowercases', () => {
    expect(normalizeForGuard('/Applications/')).toBe('/applications')
    expect(normalizeForGuard('/Applications/./Foo/..')).toBe('/applications')
    expect(normalizeForGuard('/etc/../etc')).toBe('/etc')
    expect(normalizeForGuard('//usr')).toBe('/usr')
  })
})

describe('isProtectedPath (top-level entries + /System recursive)', () => {
  it.each(['/Applications', '/applications', '/Applications/', '/Library', '/usr', '/bin', '/etc',
    '/private', '/var', '/opt', '/Volumes', '/tmp', '/', '/macOS Install Data', '/home'])('%s', (p) =>
    expect(isProtectedPath(p)).toBe(true))

  it('/System and descendants', () => {
    expect(isProtectedPath('/System')).toBe(true)
    expect(isProtectedPath('/System/Volumes/Data')).toBe(true)
    expect(isProtectedPath('/SYSTEM/Library/CoreServices')).toBe(true)
  })

  it('children of non-/System roots are editable', () => {
    expect(isProtectedPath('/Applications/Foo.app')).toBe(false)
    expect(isProtectedPath('/usr/local/bin/tool')).toBe(false)
    expect(isProtectedPath('/Volumes/USB/notes.txt')).toBe(false)
  })

  it('user dirs are not protected', () => {
    expect(isProtectedPath('/Users/x/Library')).toBe(false) // ~/Library, not /Library
    expect(isProtectedPath('/Users/x/Desktop')).toBe(false)
  })

  it('.. traversal cannot smuggle a protected path', () => {
    expect(isProtectedPath('/Users/x/../Applications')).toBe(false) // → /Users/Applications (editable)
    expect(isProtectedPath('/Users/../../Applications')).toBe(true) // → /Applications (protected)
  })
})

describe('blockDestructive', () => {
  it('true when a protected path present and guard on', () =>
    expect(blockDestructive(['/Applications', '/Users/x/f'], true)).toBe(true))
  it('false when guard off', () =>
    expect(blockDestructive(['/Applications'], false)).toBe(false))
  it('false for only unprotected', () =>
    expect(blockDestructive(['/Users/x/a'], true)).toBe(false))
})
