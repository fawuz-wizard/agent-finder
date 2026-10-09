import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HomePage from './HomePage'

function LocationProbe() {
  const loc = useLocation()
  return <output data-testid="loc">{`${loc.pathname}${loc.search}`}</output>
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/find']}>
      <Routes>
        <Route path="/find" element={<HomePage />} />
        <Route path="/search" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('U1 — Home', () => {
  it('searches around the phone\'s own position when it is shared, blunted to about 110 m', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: {
        getCurrentPosition: (ok: (p: unknown) => void) =>
          ok({ coords: { latitude: 8.470123456, longitude: -13.260987654 } }),
      },
    })
    renderHome()
    expect(await screen.findByText('Searching around your location')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Amount (SLE)'), '2000')
    await user.click(screen.getByRole('button', { name: 'Find an agent' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/search?tx=cash_out&area=Lumley&amount=2000&lat=8.47&lng=-13.261')
  })

  it('falls back to the chosen area, and says so, when location is off', async () => {
    renderHome()
    expect(await screen.findByText(/Location off — searching around Lumley/)).toBeInTheDocument()
  })

  it('states the transaction first and carries it into the search', async () => {
    const user = userEvent.setup()
    renderHome()

    expect(screen.getByRole('heading', { name: 'What do you need?' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Deposit' }))
    await user.type(screen.getByLabelText('Amount (SLE)'), '2000')
    await user.click(screen.getByRole('button', { name: 'Find an agent' }))

    expect(screen.getByTestId('loc')).toHaveTextContent('/search?tx=deposit&area=Lumley&amount=2000')
  })

  it('shows the old-Leone equivalent, the most common amount error', async () => {
    const user = userEvent.setup()
    renderHome()
    await user.type(screen.getByLabelText('Amount (SLE)'), '500')
    expect(screen.getByText('= Le 500,000 old Leones')).toBeInTheDocument()
  })

  it('rejects a zero amount instead of searching', async () => {
    const user = userEvent.setup()
    renderHome()
    await user.type(screen.getByLabelText('Amount (SLE)'), '0')
    await user.click(screen.getByRole('button', { name: 'Find an agent' }))
    expect(screen.getByText('Enter an amount above SLE 0.')).toBeInTheDocument()
    expect(screen.queryByTestId('loc')).not.toBeInTheDocument()
  })
})
