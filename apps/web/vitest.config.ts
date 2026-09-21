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
    // Hermetic: the suite runs the in-browser demo network whatever .env.local says.
    env: { VITE_API_MODE: 'mock' },
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
