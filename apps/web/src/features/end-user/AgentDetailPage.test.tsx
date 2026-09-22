import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
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
    expect(screen.getByRole('button', { name: /hide the map/i })).toHaveAttribute('aria-expanded', 'true')
    // The maps-app hand-off is still there, but quiet and secondary.
    expect(screen.getByRole('link', { name: /open in your maps app instead/i })).toHaveAttribute('target', '_blank')
  })

  it('arrives with the map open when a results card sent the customer here', async () => {
    at('/agents/af-4821?tx=cash_out&amount=2000&map=1')
    expect(await screen.findByRole('img', { name: /sketch of the way to fatmata/i })).toBeInTheDocument()
    expect(screen.getByText(/straight line, 300 m, about 4 min walk/i)).toBeInTheDocument()
  })

  it('the results card links into the app, not out of it', () => {
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
        <AgentResultCard agent={agent} to="/agents/af-4821?tx=cash_out&amount=2000" onDirections={() => undefined} />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: /get directions/i })
    expect(link).toHaveAttribute('href', '/agents/af-4821?tx=cash_out&amount=2000&map=1')
    expect(link).not.toHaveAttribute('target')
  })
})
