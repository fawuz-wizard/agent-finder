import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AgentDirectionsPage from './AgentDirectionsPage'
import { customerApi } from '@/services/customerApi'

function at(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/agents/:id/directions" element={<AgentDirectionsPage />} />
        <Route path="/agents/:id" element={<p>the shop's details</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => sessionStorage.clear())

describe('the directions screen', () => {
  it('draws the way to the agent on its own screen, with Back to the details and the same request', async () => {
    at('/agents/af-4821/directions?tx=cash_out&amount=2000')
    expect(await screen.findByRole('heading', { name: "Fatmata's Shop" })).toBeInTheDocument()
    expect(screen.getByText('Directions')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /sketch of the way to fatmata's shop: 300 m to the/i })).toBeInTheDocument()
    expect(screen.getByText(/straight-line distance, 300 m, about 4 min walk/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /walking/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /driving/i })).toHaveAttribute('aria-pressed', 'false')
    // The maps-app hand-off is still there, but quiet and secondary.
    expect(screen.getByRole('link', { name: /open walking directions in maps/i })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', '/agents/af-4821?tx=cash_out&amount=2000')
  })

  it('Back returns to the details screen', async () => {
    const user = userEvent.setup()
    at('/agents/af-4821/directions?tx=cash_out&amount=2000')
    await screen.findByRole('heading', { name: "Fatmata's Shop" })
    await user.click(screen.getByRole('link', { name: /back/i }))
    expect(await screen.findByText("the shop's details")).toBeInTheDocument()
  })

  it('measures from the shared point and no longer calls the origin simulated', async () => {
    at('/agents/af-4821/directions?tx=cash_out&amount=2000&lat=8.4405&lng=-13.2795')
    await screen.findByRole('heading', { name: "Fatmata's Shop" })
    expect(screen.getByLabelText(/^\d{2} m away$/)).toBeInTheDocument()
    expect(screen.getByText(/Straight-line distance/)).toBeInTheDocument()
    expect(screen.queryByText(/Simulated demo location/)).not.toBeInTheDocument()
  })

  it('offers Call in white on orange when the agent takes calls', async () => {
    at('/agents/af-4821/directions?tx=cash_out&amount=2000')
    await screen.findByRole('heading', { name: "Fatmata's Shop" })
    const call = screen.getByRole('link', { name: /^call$/i })
    expect(call).toHaveAttribute('href', expect.stringMatching(/^tel:/))
    expect(call).toHaveClass('text-white')
  })

  it('leaves Call out when the agent keeps the phone private', async () => {
    const real = await customerApi.agent('af-4821', { transaction: 'cash_out', amount_sle: 2000, area: 'Lumley' })
    const spy = vi.spyOn(customerApi, 'agent').mockResolvedValue({ ...real, call_url: null })
    at('/agents/af-4821/directions?tx=cash_out&amount=2000')
    await screen.findByRole('heading', { name: "Fatmata's Shop" })
    expect(screen.queryByRole('link', { name: /^call$/i })).not.toBeInTheDocument()
    spy.mockRestore()
  })

  it('says so when the agent is gone, with a way back to the search', async () => {
    at('/agents/af-0000/directions?tx=cash_out&amount=2000')
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not find that agent/i)
    expect(screen.getByRole('link', { name: /search again/i })).toHaveAttribute('href', '/find')
  })
})

describe('the outcome question follows a visit, not a look', () => {
  it('opening the map remembers nothing; "I\'m going there" starts the visit once', async () => {
    const user = userEvent.setup()
    at('/agents/af-4821/directions?tx=cash_out&amount=2000')
    await screen.findByRole('img', { name: /sketch of the way to fatmata/i })
    expect(sessionStorage.getItem('af.pendingVisit')).toBeNull()
    await user.click(screen.getByRole('button', { name: /i'm going there/i }))
    const pending = JSON.parse(sessionStorage.getItem('af.pendingVisit') ?? 'null')
    expect(pending).toMatchObject({ agentId: 'af-4821', agentName: "Fatmata's Shop", transaction: 'cash_out', amount: 2000 })
    expect(screen.getByRole('status')).toHaveTextContent(/only once, and you can skip it/i)
    expect(screen.queryByRole('button', { name: /i'm going there/i })).not.toBeInTheDocument()
  })
})
