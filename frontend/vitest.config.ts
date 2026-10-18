import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Test-only config (kept separate from vite.config.ts so `tsc -b` / prod build
// is untouched). Component/DOM tests run in jsdom with a mocked Tauri invoke.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/**/*.d.ts'],
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      thresholds: { lines: 85 },
    },
  },
})
