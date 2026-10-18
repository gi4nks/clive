import { invoke } from '@tauri-apps/api/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listDir, TauriCommandError } from './api.js'

describe('Tauri invoke contract', () => {
  beforeEach(() => vi.mocked(invoke).mockReset())

  it('sends typed camelCase argument keys to the registered command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([])
    await listDir('/tmp', true)
    expect(invoke).toHaveBeenCalledWith('list_dir', { path: '/tmp', showHidden: true })
  })

  it('normalizes string command failures while preserving their message', async () => {
    vi.mocked(invoke).mockRejectedValueOnce('Protected system location')
    const error = await listDir('/System').catch((value: unknown) => value)
    expect(error).toBeInstanceOf(TauriCommandError)
    expect(error).toMatchObject({
      code: 'tauri_command_failed',
      command: 'list_dir',
      message: 'Protected system location',
    })
    expect(String(error)).toBe('Protected system location')
  })
})
