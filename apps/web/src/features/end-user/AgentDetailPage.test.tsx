import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import AgentDetailPage from './AgentDetailPage'
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
    const link = screen.getByRole('link', { name: /view shop/i })
    expect(link).toHaveAttribute('href', '/agents/af-4821?tx=cash_out&amount=2000')
    expect(link).not.toHaveAttribute('target')
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
