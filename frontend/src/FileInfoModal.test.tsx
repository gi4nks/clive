import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { fileInfo } from './api'
import { FileInfoModal } from './FileInfoModal'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('./api', () => ({
  fileInfo: vi.fn(),
  formatDate: (seconds: number) => `date-${seconds}`,
  formatSize: (bytes: number) => `${bytes} bytes`,
  kindOf: () => 'Text File',
}))

beforeEach(() => vi.mocked(fileInfo).mockReset())

it('shows filesystem details for a selected file', async () => {
  vi.mocked(fileInfo).mockResolvedValue({
    name: 'notes.txt', path: '/tmp/notes.txt', isDir: false, size: 5,
    modified: 20, created: 10, permissions: '0644', childCount: null,
  })

  render(<FileInfoModal path="/tmp/notes.txt" onClose={() => undefined} />)

  expect(await screen.findByText('notes.txt')).toBeInTheDocument()
  expect(screen.getByText('Text File')).toBeInTheDocument()
  expect(screen.getByText('/tmp/notes.txt')).toBeInTheDocument()
  expect(screen.getByText('5 bytes')).toBeInTheDocument()
  expect(screen.getByText('0644')).toBeInTheDocument()
})

it('shows recursive size and direct item count for a folder', async () => {
  vi.mocked(fileInfo).mockResolvedValue({
    name: 'Photos', path: '/tmp/Photos', isDir: true, size: 1234,
    modified: 20, created: 10, permissions: '0755', childCount: 3,
  })

  render(<FileInfoModal path="/tmp/Photos" onClose={() => undefined} />)

  expect(await screen.findByText('Photos')).toBeInTheDocument()
  expect(screen.getByText('1234 bytes')).toBeInTheDocument()
  expect(screen.getByText('count.elements')).toBeInTheDocument()
})
