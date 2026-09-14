import { vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

// Mock the Tauri IPC layer so components/pure logic can be tested without the
// native runtime. Individual tests can override via `invoke` spy return values.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve(null)),
}))
