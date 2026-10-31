import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Hermetic: the suite runs the in-browser demo network whatever .env.local says, and never
    // uses this laptop's keys (maps, place search and error tracking run as with no key).
    env: { VITE_API_MODE: 'mock', VITE_TOMTOM_API_KEY: '', VITE_SENTRY_DSN: '', VITE_GOOGLE_MAPS_API_KEY: '' },
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
