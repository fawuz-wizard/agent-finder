import { render, screen } from '@testing-library/react'
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
  it('shows the two figures, one chart with three named lines, and labels operator data', async () => {
    renderSignedIn()
    expect(await screen.findByText(/of your open hours/i)).toBeInTheDocument()
    expect(await screen.findByText(/vs before/i)).toBeInTheDocument()
    const legend = screen.getByRole('list', { name: /legend/i })
    expect(legend).toHaveTextContent(/Found you/)
    expect(legend).toHaveTextContent(/Transactions.*Orange/)
    expect(legend).toHaveTextContent(/Status fresh/)
    expect(screen.getAllByRole('img').length).toBe(1)
  })

  it('switches range and re-labels the axis: hours for Today, days for Week', async () => {
    const user = userEvent.setup()
    renderSignedIn()
    await screen.findByRole('list', { name: /legend/i })
    expect(screen.getByRole('table', { hidden: true })).toHaveTextContent(/Fri/)
    await user.click(screen.getByRole('tab', { name: /today/i }))
    const table = await screen.findByRole('table', { hidden: true })
    await screen.findByText(/Your numbers for so far today, by hour/i)
    expect(table).toHaveTextContent(/07:00/)
  })
  it("shows the day's commission, exact for the operator's rows and an estimate for the agent's own log", async () => {
    const { operatorApi } = await import('@/services/operatorApi')
    await operatorApi.logTransaction('Agent 024', { transaction: 'deposit', amount_band: '≤500', client_token: `tok-${Date.now()}` })
    renderSignedIn()
    // The box is on screen while loading; wait for the figures to land in it.
    await screen.findByText(/Indicative tariff/)
    const hero = screen.getByLabelText("Today's commission")
    expect(hero).toHaveTextContent(/SLE/)
    // Only two rows show until asked: the agent's own log (newest) and the latest operator row.
    expect(screen.getByText('≈ SLE 6')).toBeInTheDocument()
    expect(screen.getByText(/Logged by you · estimate/)).toBeInTheDocument()
    expect(await screen.findByText('+SLE 25')).toBeInTheDocument()
    expect(screen.queryByText(/Could not complete/)).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: /show all 6/i }))
    // Seeded operator rows: the failed one earns nothing.
    expect(screen.getByText(/Could not complete/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show fewer/i })).toBeInTheDocument()
  })
})
