import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { SessionProvider } from '@/features/auth/SessionProvider'
import { SESSION_KEY } from '@/features/auth/session'
import ActivityPage from './ActivityPage'
import HistoryPage from './HistoryPage'

function renderSignedIn(page: 'activity' | 'history' = 'activity') {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ token: 't', role: 'agent', name: "Fatmata's Shop", ref: 'Agent 024', permissions: [] }),
  )
  return render(
    <SessionProvider>
      <MemoryRouter initialEntries={[`/agent/${page}`]}>
        {page === 'activity' ? <ActivityPage /> : <HistoryPage />}
      </MemoryRouter>
    </SessionProvider>,
  )
}

describe('agent activity', () => {
  it('draws one chart with three named lines: what the agent recorded, the commission, customers sent', async () => {
    renderSignedIn()
    const legend = await screen.findByRole('list', { name: /legend/i })
    expect(legend).toHaveTextContent(/Transactions/)
    expect(legend).toHaveTextContent(/CommissionSLE/)
    expect(legend).toHaveTextContent(/People who found you/)
    expect(legend).not.toHaveTextContent(/Status fresh/)
    expect(screen.getAllByRole('img').length).toBe(1)
    expect(screen.queryByRole('tab', { name: /yesterday/i })).not.toBeInTheDocument()
  })

  it('switches range and re-labels the axis: hours for Today, days for Week', async () => {
    const user = userEvent.setup()
    renderSignedIn()
    await screen.findByRole('list', { name: /legend/i })
    expect(screen.getByRole('table', { hidden: true })).toHaveTextContent(/Fri/)
    expect(screen.getByRole('heading', { name: 'This week' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /today/i }))
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
    // The heading follows the tab at once; the table follows the data a moment later.
    await waitFor(() => expect(screen.getByRole('table', { hidden: true })).toHaveTextContent(/07:00/))
  })

  it('History lists the day as the design does: type, amount, time and result, with the four chips', async () => {
    const { operatorApi } = await import('@/services/operatorApi')
    await operatorApi.logTransaction('Agent 024', { transaction: 'deposit', amount_sle: 700, client_token: `tok-${Date.now()}` })
    renderSignedIn('history')
    expect((await screen.findAllByText('SLE 700')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Deposit').length).toBeGreaterThan(1)
    // Seeded operator rows: the failed one says so.
    expect(screen.getByText(/Could not complete/)).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Withdrawal' }))
    expect(screen.getByRole('button', { name: 'Withdrawal' })).toHaveAttribute('aria-pressed', 'true')
    // Only the chip still says Deposit: no deposit row is left in the list.
    expect(screen.getAllByText('Deposit')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Transfer' }))
    expect(screen.getByText('No transfers recorded.')).toBeInTheDocument()
  })
})
