// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import i18n from './i18n'

const mocks = vi.hoisted(() => ({
  listVolumes: vi.fn(async () => [] as unknown[]),
  ejectVolume: vi.fn(async () => undefined),
}))

vi.mock('./api', async (io) => {
  const actual = await io<typeof import('./api')>()
  return {
    ...actual,
    diskSpace: async () => ({ totalBytes: 240e9, freeBytes: 40e9, usedBytes: 200e9, volumeName: '/' }),
    listVolumes: mocks.listVolumes,
    ejectVolume: mocks.ejectVolume,
  }
})

import { DiskWidget } from './widgets'
import type { WidgetCtx } from './widgetTypes'

const vols = [
  { name: 'Macintosh HD', mountPoint: '/', device: '/dev/disk3s1s1', totalBytes: 240e9, usedBytes: 200e9, freeBytes: 40e9, kind: 'internal', ejectable: false },
  { name: 'USB DISK', mountPoint: '/Volumes/USB DISK', device: '/dev/disk5s2', totalBytes: 50e9, usedBytes: 10e9, freeBytes: 40e9, kind: 'external', ejectable: true },
]

const ctx = { currentPath: '/Users/demo', home: '/home/u', navigate: vi.fn(), setStatus: vi.fn(), refresh: vi.fn() } as unknown as WidgetCtx

beforeEach(async () => {
  cleanup()
  mocks.listVolumes.mockResolvedValue(vols as never)
  await i18n.changeLanguage('en')
})
afterEach(() => cleanup())

describe('DiskWidget volumes list', () => {
  it('lists volumes with free-of-total and navigates on click', async () => {
    render(<DiskWidget ctx={ctx} />)
    fireEvent.click(screen.getByTitle('Disk'))
    await waitFor(() => expect(screen.getByText('USB DISK')).toBeInTheDocument())
    expect(screen.getByText('Macintosh HD')).toBeInTheDocument()
    const lines = screen.getAllByText(/free of/)
    expect(lines.length).toBe(2)
    expect(lines[0].textContent).toMatch(/free of .*[GM]B/)
    expect(lines[0].textContent).not.toContain('{free}')
    fireEvent.click(screen.getByText('USB DISK').closest('button')!)
    expect(ctx.navigate).toHaveBeenCalledWith('/Volumes/USB DISK')
  })
})
