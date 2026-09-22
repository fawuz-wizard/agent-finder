import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ResultsPage from './ResultsPage'
import { customerApi } from '@/services/customerApi'

function LocationProbe() {
  const loc = useLocation()
  return <output data-testid="loc">{`${loc.pathname}${loc.search}`}</output>
}

function renderResults(query = '?tx=cash_out&amount=2000&area=Lumley') {
  return render(
    <MemoryRouter initialEntries={[`/search${query}`]}>
      <Routes>
        <Route path="/search" element={<ResultsPage />} />
        <Route path="/find" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('U3 — Results', () => {
  it('separates the recommendation from a nearer agent that may not serve', async () => {
    renderResults()
    const recommended = await screen.findByRole('region', { name: /recommended — can handle your request/i })
    expect(within(recommended).getByText("Fatmata's Shop")).toBeInTheDocument()
    expect(within(recommended).getByText(/Nearest agent that can likely handle SLE 2,000/)).toBeInTheDocument()

    // The customer walks past this one on the way, so it is named and explained rather than hidden.
    const closer = screen.getByRole('region', { name: /on your way/i })
    expect(within(closer).getByText("Mohamed's Store")).toBeInTheDocument()
    expect(within(closer).getByText(/May not cover SLE 2,000 — worth asking if you are passing/)).toBeInTheDocument()
  })

  it('switches to distance order on the Nearest tab and keeps the recommendation marked', async () => {
    const user = userEvent.setup()
    renderResults()
    await screen.findByText("Fatmata's Shop")

    await user.click(screen.getByRole('tab', { name: /nearest/i }))

    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(names[0]).toBe("Mohamed's Store") // 120 m — nearest, even though it may not serve
    expect(names.indexOf("Fatmata's Shop")).toBeGreaterThan(0)
    expect(screen.getAllByText(/Our recommendation for SLE 2,000/)).toHaveLength(1)
  })

  it('never leaks a private field into the customer view', async () => {
    const { container } = renderResults()
    await screen.findByText("Fatmata's Shop")
    const text = container.textContent ?? ''
    for (const forbidden of ['MOST', 'SOME', 'SMALL', 'NONE', 'balance', 'threshold', 'signal', 'rating']) {
      expect(text.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
  })

  it('asks for a transaction when the query is missing', () => {
    renderResults('')
    expect(screen.getByText('Tell us what you need')).toBeInTheDocument()
  })

  it('opens the agent the customer tapped, carrying the request into the link', async () => {
    renderResults()
    const link = await screen.findByRole('link', { name: "Fatmata's Shop" })
    expect(link).toHaveAttribute('href', expect.stringContaining('/agents/af-4821'))
    expect(link.getAttribute('href')).toContain('tx=cash_out')
    expect(link.getAttribute('href')).toContain('amount=2000')
  })

  it('is deep-link addressable: a direct results URL renders that exact search', async () => {
    renderResults('?tx=deposit&amount=500&area=Aberdeen')
    expect(await screen.findByText(/Deposit · SLE 500 · Aberdeen/)).toBeInTheDocument()
  })

  it('sends the customer back to the form with the query intact when editing', async () => {
    const user = userEvent.setup()
    renderResults()
    await screen.findByText("Fatmata's Shop")
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/find?tx=cash_out&amount=2000&area=Lumley')
  })

  it('offers a next action when the search fails', async () => {
    vi.spyOn(customerApi, 'search').mockRejectedValue(new Error('down'))
    renderResults()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('shows an honest empty state rather than a blank screen', async () => {
    vi.spyOn(customerApi, 'search').mockResolvedValue({
      query: {
        transaction: 'cash_out',
        transaction_label: 'Cash out',
        amount_sle: 2000,
        amount_label: 'SLE 2,000',
        area: 'Lumley',
        radius_m: 2000,
        origin: { lat: 8.4405, lng: -13.2795 },
      },
      recommended: [],
      closer_not_serving: [],
      results: [],
      total: 0,
      generated_at: new Date().toISOString(),
      banner: null,
    })
    renderResults()
    expect(await screen.findByText('No agent is likely to handle this right now')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change transaction or amount' })).toBeInTheDocument()
  })
})
