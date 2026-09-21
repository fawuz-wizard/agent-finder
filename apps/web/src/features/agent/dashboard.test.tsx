import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { SessionProvider } from '@/features/auth/SessionProvider'
import { SESSION_KEY } from '@/features/auth/session'
import DashboardPage from './DashboardPage'

function renderSignedIn() {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ token: 't', role: 'agent', name: "Fatmata's Shop", ref: 'Agent 024', permissions: [] }),
  )
  return render(
    <SessionProvider>
      <MemoryRouter initialEntries={['/agent/dashboard']}>
        <DashboardPage />
      </MemoryRouter>
    </SessionProvider>,
  )
}

describe('agent dashboard', () => {
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
})
