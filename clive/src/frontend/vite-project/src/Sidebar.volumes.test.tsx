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
  return { ...actual, listVolumes: mocks.listVolumes, ejectVolume: mocks.ejectVolume }
})

import { Sidebar } from './Sidebar'

const vols = [
  { name: 'Macintosh HD', mountPoint: '/', device: '/dev/disk3s1s1', totalBytes: 240e9, usedBytes: 200e9, freeBytes: 40e9, kind: 'internal', ejectable: false },
  { name: 'USB DISK', mountPoint: '/Volumes/USB DISK', device: '/dev/disk5s2', totalBytes: 50e9, usedBytes: 10e9, freeBytes: 40e9, kind: 'external', ejectable: true },
  { name: 'downloads', mountPoint: '/Volumes/downloads', device: '//u@host/downloads', totalBytes: 3e12, usedBytes: 2e12, freeBytes: 1e12, kind: 'network', ejectable: true },
]

const base = {
  open: true,
  home: '/home/u',
  pinned: [],
  remoteLocations: [],
  onToggle: vi.fn(),
  onOpenItem: vi.fn(),
  onDropToDir: vi.fn(),
  onPinPaths: vi.fn(),
  onUnpin: vi.fn(),
  onReorder: vi.fn(),
  onAdd: vi.fn(),
  onRemoveRemote: vi.fn(),
  onRemoteError: vi.fn(),
  onRowContext: vi.fn(),
}

beforeEach(async () => {
  cleanup()
  mocks.listVolumes.mockClear()
  mocks.ejectVolume.mockClear()
  mocks.listVolumes.mockResolvedValue(vols as never)
  await i18n.changeLanguage('en')
})
afterEach(() => cleanup())

describe('Sidebar volumes section', () => {
  it('lists all mounted volumes and navigates to the mount point', async () => {
    render(<Sidebar {...base} />)
    await waitFor(() => expect(screen.getByText('USB DISK')).toBeInTheDocument())
    expect(screen.getByText('Macintosh HD')).toBeInTheDocument()
    fireEvent.click(screen.getByText('downloads').closest('button')!)
    expect(base.onOpenItem).toHaveBeenCalledWith('/Volumes/downloads')
  })

  it('shows eject only for ejectable volumes and calls ejectVolume after confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<Sidebar {...base} />)
    await waitFor(() => expect(screen.getAllByLabelText('Eject')).toHaveLength(2))
    fireEvent.click(screen.getAllByLabelText('Eject')[0])
    await waitFor(() => expect(mocks.ejectVolume).toHaveBeenCalledWith('/Volumes/USB DISK'))
  })

  it('keeps the volume mounted when confirm is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Sidebar {...base} />)
    await waitFor(() => expect(screen.getAllByLabelText('Eject')).toHaveLength(2))
    fireEvent.click(screen.getAllByLabelText('Eject')[0])
    await new Promise((r) => setTimeout(r, 30))
    expect(mocks.ejectVolume).not.toHaveBeenCalled()
  })
})
