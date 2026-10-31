import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { SessionProvider } from '@/features/auth/SessionProvider'
import { SESSION_KEY } from '@/features/auth/session'
import ActivityPage from './ActivityPage'

function renderSignedIn() {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ token: 't', role: 'agent', name: "Fatmata's Shop", ref: 'Agent 024', permissions: [] }),
  )
  return render(
    <SessionProvider>
      <MemoryRouter initialEntries={['/agent/activity']}>
        <ActivityPage />
      </MemoryRouter>
    </SessionProvider>,
  )
}

describe('agent activity', () => {
  it('shows the two figures and one chart with two named lines, and labels operator data', async () => {
    renderSignedIn()
    expect(await screen.findByText(/customers found you/i)).toBeInTheDocument()
    const legend = screen.getByRole('list', { name: /legend/i })
    expect(legend).toHaveTextContent(/Found you/)
    expect(legend).toHaveTextContent(/Transactions.*Orange/)
    expect(legend).not.toHaveTextContent(/Status fresh/)
    expect(screen.getAllByRole('img').length).toBe(1)
    expect(screen.queryByRole('tab', { name: /yesterday/i })).not.toBeInTheDocument()
  })

  it('switches range and re-labels the axis: hours for Today, days for Week', async () => {
    const user = userEvent.setup()
    renderSignedIn()
    await screen.findByRole('list', { name: /legend/i })
    expect(screen.getByRole('table', { hidden: true })).toHaveTextContent(/Fri/)
    expect(screen.getByText('Your week')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /today/i }))
    expect(screen.getByText('Your day')).toBeInTheDocument()
    // The heading follows the tab at once; the table follows the data a moment later.
    await waitFor(() => expect(screen.getByRole('table', { hidden: true })).toHaveTextContent(/07:00/))
  })

  it('tells the whole day in one timeline, with the operator\'s rows marked', async () => {
    renderSignedIn()
    expect(await screen.findByText('What happened')).toBeInTheDocument()
    expect(await screen.findByText(/You set yourself Open/)).toBeInTheDocument()
    expect(screen.getAllByText('Orange').length).toBeGreaterThan(0)
    expect(screen.queryByText(/agent app/i)).not.toBeInTheDocument()
  })
  it("shows the day's commission, exact for the operator's rows and an estimate for the agent's own log", async () => {
    const { operatorApi } = await import('@/services/operatorApi')
    await operatorApi.logTransaction('Agent 024', { transaction: 'deposit', amount_band: '≤500', client_token: `tok-${Date.now()}` })
    renderSignedIn()
    // The box is on screen while loading; wait for the figures to land in it.
    await screen.findByText(/Indicative tariff/)
    const hero = screen.getByLabelText("Today's commission")
    expect(hero).toHaveTextContent(/SLE/)
    // Every row of the day, as the design lists them; the agent's own log is an estimate.
    expect(screen.getByText('≈ SLE 6')).toBeInTheDocument()
    expect(screen.getByText(/Logged by you · estimate/)).toBeInTheDocument()
    expect((await screen.findAllByText('+SLE 25')).length).toBeGreaterThan(0)
    // Seeded operator rows: the failed one earns nothing.
    expect(screen.getByText(/Could not complete/)).toBeInTheDocument()
    // The chips filter by side.
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Cash in' }))
    expect(screen.getByRole('button', { name: 'Cash in' })).toHaveAttribute('aria-pressed', 'true')
    // Only the chip still says Cash out: no cash-out row is left in the list.
    expect(screen.getAllByText('Cash out')).toHaveLength(1)
  })
})
