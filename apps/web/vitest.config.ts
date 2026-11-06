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
    // Screens load the demo network lazily; with every file running at once on a laptop or a CI
    // runner, a full flow (sign in, record, land on the timeline) can pass 5 s. Generous limits
    // keep the suite from failing on load alone; a real hang still fails.
    testTimeout: 20_000,
  },
})
