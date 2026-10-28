import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { SessionProvider } from '@/features/auth/SessionProvider'
import { SESSION_KEY } from '@/features/auth/session'
import NetworkMapPage from './NetworkMapPage'

function renderAs(permissions: string[], name: string) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 't', role: 'dealer', name, ref: name, permissions }))
  return render(
    <SessionProvider>
      <MemoryRouter initialEntries={['/dealer/map']}>
        <Routes>
          <Route path="/dealer/map" element={<NetworkMapPage />} />
          <Route path="/dealer" element={<p>dashboard</p>} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  )
}

beforeEach(() => sessionStorage.clear())

describe('the national map screen', () => {
  it('opens on the whole country for Orange and drills into a region and an aggregator', async () => {
    const user = userEvent.setup()
    renderAs(['VIEW_AGENT', 'VIEW_NATIONAL'], 'Orange Sierra Leone')
    expect(await screen.findByText(/confirmed on the customer map/)).toBeInTheDocument()
    const table = screen.getByRole('table')
    for (const r of ['West', 'North', 'South', 'East', 'No place on record']) expect(within(table).getByRole('button', { name: r })).toBeInTheDocument()
    await user.click(within(table).getByRole('button', { name: 'North' }))
    expect(await within(table).findByRole('button', { name: 'Northern Link' })).toBeInTheDocument()
    expect(within(table).queryByRole('button', { name: 'West' })).not.toBeInTheDocument()
    await user.click(within(table).getByRole('button', { name: 'Northern Link' }))
    expect(await screen.findByText(/Northern Link's shops confirmed/)).toBeInTheDocument()
    expect(await within(table).findByRole('button', { name: 'Makeni shop 1' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Whole country' }))
    expect(await within(table).findByRole('button', { name: 'West' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download for Excel' })).toBeInTheDocument()
  })

  it('shows an aggregator their own agents only, with a way back to the dashboard', async () => {
    renderAs(['VIEW_AGENT'], 'Kissy Distribution')
    expect(await screen.findByText(/Agent network · Kissy Distribution/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '‹ Dashboard' })).toHaveAttribute('href', '/dealer')
    expect(screen.queryByText('Northern Link')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/SLE \d/)
  })
})
