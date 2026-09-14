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
import { ConfirmDialog } from './ConfirmDialog'

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
    render(
      <>
        <Sidebar {...base} />
        <ConfirmDialog />
      </>,
    )
    await waitFor(() => expect(screen.getAllByLabelText('Eject')).toHaveLength(2))
    fireEvent.click(screen.getAllByLabelText('Eject')[0])
    await waitFor(() => expect(screen.getByText(/Eject “USB DISK”/)).toBeInTheDocument())
    fireEvent.click([...document.querySelectorAll('[data-confirm-dialog] .modal-box button')].at(-1)!)
    await waitFor(() => expect(mocks.ejectVolume).toHaveBeenCalledWith('/Volumes/USB DISK'))
  })

  it('right-click on a volume opens a context menu with open/reveal/eject', async () => {
    render(<Sidebar {...base} />)
    await waitFor(() => expect(screen.getByText('USB DISK')).toBeInTheDocument())
    fireEvent.contextMenu(screen.getByText('USB DISK').closest('button')!)
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Reveal in Finder')).toBeInTheDocument()
    expect(screen.getByText('Eject')).toBeInTheDocument()
    expect(screen.queryByText('Copy path')).toBeInTheDocument()
  })

  it('right-click on a remote shows open/disconnect/remove', async () => {
    const p2 = { ...base, remoteLocations: [{ id: 'r1', name: 'NAS', path: '/Volumes/nas', kind: 'smb', endpoint: 'smb://nas/share' }] }
    render(<Sidebar {...p2} />)
    await waitFor(() => expect(screen.getByText('NAS')).toBeInTheDocument())
    fireEvent.contextMenu(screen.getByText('NAS').closest('button')!)
    const menu = document.querySelector('.menu.fixed') ?? document.body
    expect(menu.textContent).toContain('Open')
    expect(menu.textContent).toContain('Remove')
    expect(menu.textContent).toContain('Copy path')
  })

  it('keeps the volume mounted when the dialog is cancelled', async () => {
    render(
      <>
        <Sidebar {...base} />
        <ConfirmDialog />
      </>,
    )
    await waitFor(() => expect(screen.getAllByLabelText('Eject')).toHaveLength(2))
    fireEvent.click(screen.getAllByLabelText('Eject')[0])
    await waitFor(() => expect(screen.getByText(/Eject “USB DISK”/)).toBeInTheDocument())
    fireEvent.click(screen.getByText('Cancel'))
    await new Promise((r) => setTimeout(r, 50))
    expect(mocks.ejectVolume).not.toHaveBeenCalled()
  })
})
