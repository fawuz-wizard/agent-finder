import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/design'
import { SessionProvider } from '@/features/auth/SessionProvider'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('app router', () => {
  it('has no admin surface for the pilot: /admin is a plain not-found page', async () => {
    // The browser router reads the URL when the module loads, so set it before importing.
    window.history.replaceState({}, '', '/admin/reports')
    const { AppRouter } = await import('./router')
    render(
      <ToastProvider>
        <SessionProvider>
          <AppRouter />
        </SessionProvider>
      </ToastProvider>,
    )
    expect(await screen.findByText(/that page doesn't exist/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /agents/i })).not.toBeInTheDocument()
  })

  it('the Agent App build opens on sign-in, never on the customer home', async () => {
    vi.stubEnv('VITE_APP_SURFACE', 'agent')
    vi.resetModules()
    window.history.replaceState({}, '', '/')
    const { AppRouter } = await import('./router')
    const { ToastProvider: TP } = await import('@/design')
    const { SessionProvider: SP } = await import('@/features/auth/SessionProvider')
    render(
      <TP>
        <SP>
          <AppRouter />
        </SP>
      </TP>,
    )
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByText('Agent App')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agent Finder' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /go to agent finder/i })).not.toBeInTheDocument()
  })
})
