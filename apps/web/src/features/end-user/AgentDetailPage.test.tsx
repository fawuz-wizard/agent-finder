import { render, screen } from '@testing-library/react'
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

  it('Call and Get Directions read in white on the orange buttons', async () => {
    at('/agents/af-4821?tx=cash_out&amount=2000')
    await screen.findByText("Fatmata's Shop")
    const directions = screen.getByRole('link', { name: /get directions/i })
    const call = screen.getByRole('link', { name: /^call$/i })
    for (const el of [directions, call]) {
      expect(el).toHaveClass('text-white')
      expect(el).not.toHaveClass('text-finder-on-orange')
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
  it('measures from the shared point', async () => {
    at('/agents/af-4821?tx=cash_out&amount=2000&lat=8.4405&lng=-13.2795')
    await screen.findByText("Fatmata's Shop")
    // The blunted point (~110 m grid) lands about 80 m from her shop: a real, short distance.
    expect(screen.getByLabelText(/^\d{2} m away$/)).toBeInTheDocument()
  })
})

describe('the details carry no praise', () => {
  it('shows no verdict and no request line when the agent can likely handle the request', async () => {
    at('/agents/af-4821?tx=cash_out&amount=2000')
    await screen.findByText("Fatmata's Shop")
    expect(screen.queryByRole('region', { name: /your request/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/for cash out/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/can likely handle your request/i)).not.toBeInTheDocument()
  })

  it('still cautions when the agent may not cover the amount, with how fresh the picture is', async () => {
    const real = await customerApi.agent('af-4821', { transaction: 'cash_out', amount_sle: 2000, area: 'Lumley' })
    const spy = vi.spyOn(customerApi, 'agent').mockResolvedValue({ ...real, outcome: 'limited', outcome_text: 'Limited — may not cover this amount' })
    at('/agents/af-4821?tx=cash_out&amount=2000')
    await screen.findByText("Fatmata's Shop")
    const section = screen.getByRole('region', { name: /your request/i })
    expect(section).toHaveTextContent(/limited — may not cover this amount/i)
    expect(section).toHaveTextContent(/updated/i)
    expect(section).not.toHaveTextContent(/for cash out/i)
    spy.mockRestore()
  })
})

describe('looking at the shop is not a visit', () => {
  it('opening the details remembers nothing', async () => {
    at('/agents/af-4821?tx=cash_out&amount=2000')
    await screen.findByText("Fatmata's Shop")
    expect(sessionStorage.getItem('af.pendingVisit')).toBeNull()
    expect(screen.queryByRole('button', { name: /i'm going there/i })).not.toBeInTheDocument()
  })
})
