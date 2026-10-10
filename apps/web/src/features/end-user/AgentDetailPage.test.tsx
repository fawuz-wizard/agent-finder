import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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

describe('directions stay inside the app', () => {
  it('opens the way to the agent under the agent, never in another app', async () => {
    const user = userEvent.setup()
    at('/agents/af-4821?tx=cash_out&amount=2000')
    await screen.findByText("Fatmata's Shop")
    expect(screen.queryByRole('img', { name: /way to fatmata/i })).not.toBeInTheDocument()
    const cta = screen.getByRole('button', { name: /get directions/i })
    expect(cta).toHaveAttribute('aria-expanded', 'false')
    await user.click(cta)
    const sketch = await screen.findByRole('img', { name: /sketch of the way to fatmata's shop: 300 m to the/i })
    expect(sketch).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /hide map/i })).toHaveAttribute('aria-expanded', 'true')
    // The maps-app hand-off is still there, but quiet and secondary.
    expect(screen.getByRole('link', { name: /open walking directions in maps/i })).toHaveAttribute('target', '_blank')
  })

  it('keeps the map closed until the customer chooses directions', async () => {
    const user = userEvent.setup()
    at('/agents/af-4821?tx=cash_out&amount=2000&map=1')
    await screen.findByText("Fatmata's Shop")
    expect(screen.queryByRole('img', { name: /sketch of the way to fatmata/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /get directions/i }))
    expect(await screen.findByRole('img', { name: /sketch of the way to fatmata/i })).toBeInTheDocument()
    expect(screen.getByText(/straight-line distance, 300 m, about 4 min walk/i)).toBeInTheDocument()
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
      outcome_text: 'Can likely handle your request',
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

describe('distances from the customer\'s own position', () => {
  it('measures from the shared point and no longer calls the origin simulated', async () => {
    const user = userEvent.setup()
    at('/agents/af-4821?tx=cash_out&amount=2000&lat=8.4405&lng=-13.2795')
    await screen.findByText("Fatmata's Shop")
    // The blunted point (~110 m grid) lands about 80 m from her shop: a real, short distance.
    expect(screen.getByLabelText(/^\d{2} m away$/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /get directions/i }))
    expect(await screen.findByText(/Straight-line distance/)).toBeInTheDocument()
    expect(screen.queryByText(/Simulated demo location/)).not.toBeInTheDocument()
  })
})

describe('the outcome question follows a visit, not a look', () => {
  it('opening the map remembers nothing; "I\'m going there" starts the visit once', async () => {
    const user = userEvent.setup()
    at('/agents/af-4821?tx=cash_out&amount=2000')
    await screen.findByText("Fatmata's Shop")
    await user.click(screen.getByRole('button', { name: /get directions/i }))
    await screen.findByRole('img', { name: /sketch of the way to fatmata/i })
    expect(sessionStorage.getItem('af.pendingVisit')).toBeNull()
    await user.click(screen.getByRole('button', { name: /i'm going there/i }))
    const pending = JSON.parse(sessionStorage.getItem('af.pendingVisit') ?? 'null')
    expect(pending).toMatchObject({ agentId: 'af-4821', agentName: "Fatmata's Shop", transaction: 'cash_out', amount: 2000 })
    expect(screen.getByRole('status')).toHaveTextContent(/only once, and you can skip it/i)
    expect(screen.queryByRole('button', { name: /i'm going there/i })).not.toBeInTheDocument()
  })
})
