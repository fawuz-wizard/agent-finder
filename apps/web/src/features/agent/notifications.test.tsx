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

// The demo agent's day is built from the seeded network, which loads lazily; under a full-suite
// run that can take longer than Testing Library's 1 s default.
const SLOW = { timeout: 8_000 }

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('the bell', () => {
  it('counts what is new on the home header, opens the list, and remembers what was seen on this phone', async () => {
    const user = userEvent.setup()
    renderApp()
    const bell = await screen.findByRole('link', { name: /notifications, \d+ new/i }, SLOW)
    const count = Number(/(\d+) new/.exec(bell.getAttribute('aria-label') ?? '')![1])
    expect(count).toBeGreaterThan(0)
    await user.click(bell)
    expect(await screen.findByText('Notifications', {}, SLOW)).toBeInTheDocument()
    // The demo agent's day: customers who could not be served, and a comment.
    expect((await screen.findAllByText(/could not be served/i, {}, SLOW)).length).toBeGreaterThan(0)
    expect(screen.getByText(/new customer comment/i)).toBeInTheDocument()
    // Every row leads somewhere.
    for (const row of screen.getAllByRole('link').filter((l) => l.getAttribute('href')?.startsWith('/agent/'))) {
      expect(row.getAttribute('href')).toMatch(/^\/agent(\/|$)/)
    }
    // Opened once: back home, the badge is gone and stays gone.
    await user.click(screen.getByRole('link', { name: 'Home' }))
    await waitFor(() => expect(screen.getByRole('link', { name: 'Notifications' })).toBeInTheDocument(), SLOW)
    expect(JSON.parse(localStorage.getItem('af.seenNotifications') ?? '[]').length).toBe(count)
  }, 20_000)
})

describe('the check-in at the pin in the bell', () => {
  it('keeps "your location has changed" and "you\'re back" in the bell, today only, newest first', async () => {
    const { buildNotifications, noteShopAlert } = await import('./notifications')
    localStorage.removeItem('af.shopAlerts')
    noteShopAlert({ kind: 'left', metres: 1234 })
    noteShopAlert({ kind: 'back' })
    const list = buildNotifications(null, null)
    expect(list[0]!.text).toMatch(/You're back at your shop/)
    expect(list[1]!.text).toBe("Your location has changed · 1.2 km from your pin · customers can't see you until you're back")
    expect(list.every((n) => n.to === '/agent/status' || !n.id.startsWith('shop-'))).toBe(true)
    localStorage.removeItem('af.shopAlerts')
  })
})
