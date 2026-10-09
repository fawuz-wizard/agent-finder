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
  it('shows likely matches under Recommended and links to nearer uncertain options', async () => {
    renderResults()
    const recommended = await screen.findByRole('region', { name: /recommended agents/i })
    expect(within(recommended).getByText("Fatmata's Shop")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /closer open agents may have uncertain availability.*see nearest/i })).toBeInTheDocument()
  })

  it('switches to distance order on Nearest and includes uncertain agents', async () => {
    const user = userEvent.setup()
    renderResults()
    await screen.findByText("Fatmata's Shop")

    await user.click(screen.getByRole('tab', { name: /nearest \(/i }))

    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(names[0]).toBe('Aminata Trading') // nearest to the simulated Lumley search point
    expect(names.indexOf("Fatmata's Shop")).toBeGreaterThan(0)
    expect(screen.getByText('Availability uncertain for this request')).toBeInTheDocument()
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

  it('sends the shared position to the search and measures from it, and says so', async () => {
    const spy = vi.spyOn(customerApi, 'search')
    renderResults('?tx=cash_out&amount=2000&area=Lumley&lat=8.4405&lng=-13.2795')
    await screen.findByText("Fatmata's Shop")
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ lat: 8.441, lng: -13.28 }), expect.anything())
    expect(screen.getByText('500 m core · Your location')).toBeInTheDocument()
    // Fatmata's own point: she is the closest to the phone now, and the link carries the point.
    const link = screen.getByRole('link', { name: "Fatmata's Shop" })
    expect(link.getAttribute('href')).toContain('lat=8.441')
    expect(screen.getAllByRole('heading', { level: 3 })[0]).toHaveTextContent("Fatmata's Shop")
  })

  it('says which area it searched around when no position was shared', async () => {
    renderResults()
    await screen.findByText("Fatmata's Shop")
    expect(screen.getByText('500 m core · Around Lumley')).toBeInTheDocument()
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
    expect(await screen.findByText('No open agents found in this area')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change transaction or amount' })).toBeInTheDocument()
  })
})
