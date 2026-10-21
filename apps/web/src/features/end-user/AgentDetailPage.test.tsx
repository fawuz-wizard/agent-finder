import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AgentDetailPage from './AgentDetailPage'
import { customerApi } from '@/services/customerApi'
import { AgentResultCard } from './components/AgentResultCard'
import type { AgentResult } from '@/types/public'

function at(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/agents/:id" element={<AgentDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => sessionStorage.clear())

describe("the shop's photo", () => {
  it('is shown on the sheet and the card when the agent took one, and the mark stands in otherwise', async () => {
    const real = await customerApi.agent('af-4821', { transaction: 'cash_out', amount_sle: 2000, area: 'Lumley' })
    const photo_url = '/api/v1/agents/af-4821/photo?v=1'
    const spy = vi.spyOn(customerApi, 'agent').mockResolvedValue({ ...real, photo_url })
    at('/agents/af-4821?tx=cash_out&amount=2000')
    const hero = await screen.findByRole('img', { name: "Fatmata's Shop, photographed by the agent" })
    expect(hero.getAttribute('src')).toMatch(/^http.*\/api\/v1\/agents\/af-4821\/photo\?v=1$/)
    spy.mockRestore()
    const { container } = render(
      <MemoryRouter>
        <AgentResultCard agent={{ ...real, photo_url } as AgentResult} to="/agents/af-4821" />
      </MemoryRouter>,
    )
    expect(container.querySelector('img')?.getAttribute('src')).toMatch(/\/api\/v1\/agents\/af-4821\/photo/)
    const { container: plain } = render(
      <MemoryRouter>
        <AgentResultCard agent={{ ...real, photo_url: null } as AgentResult} to="/agents/af-4821" />
      </MemoryRouter>,
    )
    expect(plain.querySelector('img')).toBeNull()
  })
})

describe('directions are the next screen, inside the app', () => {
  it('shows no map on the details; Get Directions leads to the directions screen with the same request', async () => {
    at('/agents/af-4821?tx=cash_out&amount=2000&lat=8.4405&lng=-13.2795')
    await screen.findByText("Fatmata's Shop")
    expect(screen.queryByRole('img', { name: /way to fatmata/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /hide map/i })).not.toBeInTheDocument()
    const cta = screen.getByRole('link', { name: /get directions/i })
    expect(cta).toHaveAttribute('href', '/agents/af-4821/directions?tx=cash_out&amount=2000&lat=8.4405&lng=-13.2795')
    expect(cta).not.toHaveAttribute('target')
  })

  it('Call and Get Directions read in black on the orange buttons, as Orange\'s rule and the contrast standard ask', async () => {
    at('/agents/af-4821?tx=cash_out&amount=2000')
    await screen.findByText("Fatmata's Shop")
    const directions = screen.getByRole('link', { name: /get directions/i })
    const call = screen.getByRole('link', { name: /^call$/i })
    for (const el of [directions, call]) {
      expect(el).toHaveClass('text-finder-on-orange')
      expect(el).not.toHaveClass('text-white')
    }
    expect(call).toHaveAttribute('href', expect.stringMatching(/^tel:/))
  })

  it('the results card opens the shop details before directions', () => {
    const agent: AgentResult = {
      id: 'af-4821',
      name: "Fatmata's Shop",
      area: 'Lumley Junction',
      lat: 8.4405,
      lng: -13.2795,
      distance_m: 300,
      outcome: 'likely',
      outcome_text: 'Likely to serve you',
      freshness: 'fresh',
      freshness_text: 'Updated 6 min ago',
      directions_url: 'https://www.google.com/maps/dir/?api=1&destination=8.4405,-13.2795',
      can_call: true,
    }
    render(
      <MemoryRouter>
        <AgentResultCard agent={agent} to="/agents/af-4821?tx=cash_out&amount=2000" />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: /get details/i })
    expect(link).toHaveAttribute('href', '/agents/af-4821?tx=cash_out&amount=2000')
    expect(link).not.toHaveAttribute('target')
  })
})

describe('rating', () => {
  it('tapping the chosen star again keeps it, and the button says what will be sent', async () => {
    const user = userEvent.setup()
    at('/agents/af-4821?tx=cash_out&amount=2000')
    await screen.findByText("Fatmata's Shop")
    await user.click(screen.getByRole('radio', { name: '4 out of 5' }))
    expect(screen.getByRole('button', { name: 'Submit 4-star rating' })).toBeEnabled()
    await user.click(screen.getByRole('radio', { name: '4 out of 5' }))
    expect(screen.getByRole('radio', { name: '4 out of 5' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'Submit 4-star rating' })).toBeInTheDocument()
    expect(screen.queryByText(/max it|browser/i)).not.toBeInTheDocument()
  })
})

describe('back on a pasted link', () => {
  it('goes to the search with the same request when there is no history to go back to', async () => {
    const user = userEvent.setup()
    function Probe() {
      const l = useLocation()
      return <p data-testid="loc">{l.pathname + l.search}</p>
    }
    render(
      <MemoryRouter initialEntries={['/agents/af-4821?tx=cash_out&amount=2000']}>
        <Routes>
          <Route path="/agents/:id" element={<AgentDetailPage />} />
          <Route path="/search" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByText("Fatmata's Shop")
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(await screen.findByTestId('loc')).toHaveTextContent('/search?tx=cash_out&amount=2000')
  })
})

describe('distances from the customer\'s own position', () => {
  it('measures from the shared point', async () => {
    at('/agents/af-4821?tx=cash_out&amount=2000&lat=8.4405&lng=-13.2795')
    await screen.findByText("Fatmata's Shop")
    // The blunted point (~110 m grid) lands about 80 m from her shop: a real, short distance.
    expect(screen.getByLabelText(/^\d{2} m away$/)).toBeInTheDocument()
  })
})

describe('the details answer the request with a figure, never with praise', () => {
  it('says how likely the customer is to be served for their own request, never 100', async () => {
    at('/agents/af-4821?tx=cash_out&amount=2000')
    await screen.findByText("Fatmata's Shop")
    const section = screen.getByRole('region', { name: /your request/i })
    const group = within(section).getByRole('group', { name: /% likely to serve you/ })
    const pct = Number(/^(\d+)%/.exec(group.getAttribute('aria-label') ?? '')![1])
    expect(pct % 5).toBe(0)
    expect(pct).toBeLessThanOrEqual(95)
    expect(section).toHaveTextContent(/for cash out · SLE 2,000/i)
    expect(section).toHaveTextContent(/updated/i)
    expect(screen.queryByText(/can likely handle your request/i)).not.toBeInTheDocument()
  })

  it('shows nothing where no figure applies and there is nothing to caution about', async () => {
    const real = await customerApi.agent('af-4821', { transaction: 'cash_out', amount_sle: 2000, area: 'Lumley' })
    const spy = vi.spyOn(customerApi, 'agent').mockResolvedValue({ ...real, served_pct: null, served_text: null })
    at('/agents/af-4821?tx=cash_out&amount=2000')
    await screen.findByText("Fatmata's Shop")
    expect(screen.queryByRole('region', { name: /your request/i })).not.toBeInTheDocument()
    spy.mockRestore()
  })

  it('still cautions when the agent may not cover the amount, with how fresh the picture is', async () => {
    const real = await customerApi.agent('af-4821', { transaction: 'cash_out', amount_sle: 2000, area: 'Lumley' })
    const spy = vi.spyOn(customerApi, 'agent').mockResolvedValue({ ...real, outcome: 'limited', outcome_text: 'Limited — may not cover this amount', served_pct: null, served_text: null })
    at('/agents/af-4821?tx=cash_out&amount=2000')
    await screen.findByText("Fatmata's Shop")
    const section = screen.getByRole('region', { name: /your request/i })
    expect(section).toHaveTextContent(/limited — may not cover this amount/i)
    expect(section).toHaveTextContent(/updated/i)
    expect(section).not.toHaveTextContent(/for cash out/i)
    spy.mockRestore()
  })
})

describe('saying how it went is the customer\'s choice', () => {
  it('offers Report a visit with the shop already chosen, and asks nothing by itself', async () => {
    at('/agents/af-4821?tx=cash_out&amount=2000')
    await screen.findByText("Fatmata's Shop")
    expect(screen.getByRole('link', { name: /report a visit/i })).toHaveAttribute('href', '/report-a-visit')
    expect(sessionStorage.getItem('af.pendingVisit')).toBeNull()
    expect(screen.queryByRole('button', { name: /i'm going there/i })).not.toBeInTheDocument()
  })
})
