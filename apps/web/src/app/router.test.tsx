import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ToastProvider } from '@/design'
import { SessionProvider } from '@/features/auth/SessionProvider'

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
})
