import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { ToastProvider } from '@/design'
import { SessionProvider } from '@/features/auth/SessionProvider'
import { SESSION_KEY } from '@/features/auth/session'
import { AgentLayout } from '@/app/layouts'
import DashboardPage from './DashboardPage'
import NotificationsPage from './NotificationsPage'

function renderApp() {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 't', role: 'agent', name: "Fatmata's Shop", ref: 'Agent 024', permissions: [] }))
  return render(
    <ToastProvider>
      <SessionProvider>
        <MemoryRouter initialEntries={['/agent']}>
          <Routes>
            <Route element={<AgentLayout />}>
              <Route path="/agent" element={<DashboardPage />} />
              <Route path="/agent/notifications" element={<NotificationsPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </ToastProvider>,
  )
}

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('the bell', () => {
  it('counts what is new on top of every agent screen, opens the list, and remembers what was seen on this phone', async () => {
    const user = userEvent.setup()
    renderApp()
    const bell = await screen.findByRole('link', { name: /notifications, \d+ new/i })
    const count = Number(/(\d+) new/.exec(bell.getAttribute('aria-label') ?? '')![1])
    expect(count).toBeGreaterThan(0)
    await user.click(bell)
    expect(await screen.findByText('Notifications')).toBeInTheDocument()
    // The demo agent's day: customers who could not be served, and a comment.
    expect((await screen.findAllByText(/could not be served/i)).length).toBeGreaterThan(0)
    expect(screen.getByText(/new customer comment/i)).toBeInTheDocument()
    // Every row leads somewhere.
    for (const row of screen.getAllByRole('link').filter((l) => l.getAttribute('href')?.startsWith('/agent/'))) {
      expect(row.getAttribute('href')).toMatch(/^\/agent(\/|$)/)
    }
    // Opened once: the badge is gone and stays gone across the shell.
    await waitFor(() => expect(screen.getByRole('link', { name: 'Notifications' })).toBeInTheDocument())
    expect(JSON.parse(localStorage.getItem('af.seenNotifications') ?? '[]').length).toBe(count)
  })
})
