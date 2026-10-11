import { render, screen, within } from '@testing-library/react'
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

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  sessionStorage.clear()
})

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
    expect(await screen.findByText(/Searching around your location/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Amount (SLE)'), '2000')
    await user.click(screen.getByRole('button', { name: 'Find agent' }))
    // No one could name the place (no network in tests), so the label is honest and plain.
    expect(screen.getByTestId('loc')).toHaveTextContent('/search?tx=cash_out&area=Your+location&amount=2000&lat=8.47&lng=-13.261')
  })

  it('offers a place search, never a fixed area, when the phone has no location at all', async () => {
    const user = userEvent.setup()
    renderHome()
    expect(await screen.findByText('This phone cannot share its location.')).toBeInTheDocument()
    expect(screen.queryByText(/Lumley/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Search a place instead' }))
    expect(screen.getByRole('searchbox', { name: 'Search a place' })).toBeInTheDocument()
    expect(screen.getByText('Type a neighbourhood, road or town.')).toBeInTheDocument()
  })

  it('states the transaction first and carries it into the search, from a place the customer found on the map', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [{ name: 'Aberdeen', lat: '8.4842', lon: '-13.2711', address: { suburb: 'Aberdeen', city: 'Freetown' } }] })))
    renderHome()

    expect(screen.getByRole('heading', { name: 'What do you need?' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Cash in' }))
    await user.type(screen.getByLabelText('Amount (SLE)'), '2000')
    // No location on this phone: Find agent opens the place search instead of guessing an area.
    await user.click(screen.getByRole('button', { name: 'Find agent' }))
    expect(screen.queryByTestId('loc')).not.toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: 'Search a place' }), 'Aber')
    await user.click(await screen.findByRole('button', { name: /Aberdeen/ }))
    expect(screen.getByText(/Searching around Aberdeen/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Find agent' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/search?tx=deposit&area=Aberdeen&amount=2000&lat=8.484&lng=-13.271&by=place')
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
    await user.click(screen.getByRole('button', { name: 'Find agent' }))
    expect(screen.getByText('Enter an amount above SLE 0.')).toBeInTheDocument()
    expect(screen.queryByTestId('loc')).not.toBeInTheDocument()
  })
  it('lists the shops opened lately under Recent, newest first', async () => {
    localStorage.setItem(
      'af.recentAgents',
      JSON.stringify([
        { id: 'af-1', name: "Fatmata's Shop", area: 'Lumley', at: Date.now() },
        { id: 'af-2', name: 'Coco and Sons', area: 'Aberdeen', at: Date.now() - 24 * 60 * 60 * 1000 },
      ]),
    )
    renderHome()
    const recent = await screen.findByRole('region', { name: 'Recent' })
    const links = within(recent).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(["Fatmata's Shop", 'Coco and Sons'])
    expect(links[0]).toHaveAttribute('href', '/agents/af-1?area=Lumley')
    expect(within(recent).getByText('Aberdeen · yesterday')).toBeInTheDocument()
    localStorage.clear()
  })
  it('fills the amount from a quick pill', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 8.47, longitude: -13.26 } }) } })
    renderHome()
    await screen.findByText(/Searching around your location/)
    await user.click(screen.getByRole('button', { name: '2,000' }))
    expect(screen.getByRole('button', { name: '2,000' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('= Le 2,000,000 old Leones')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Find agent' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('amount=2000')
  })
})

describe('U1 — Home asks for the live location first', () => {
  function phone(answer: (ok: (p: unknown) => void, fail: (e: { code: number }) => void) => void) {
    const getCurrentPosition = vi.fn(answer)
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } })
    return getCurrentPosition
  }

  it('tells the customer how to turn location on when the phone refuses', async () => {
    phone((_ok, fail) => fail({ code: 2 }))
    renderHome()
    expect(await screen.findByText('Location is switched off on this phone.')).toBeInTheDocument()
    expect(screen.getByText(/turn on Location, then try again\.$/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn on location' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search a place instead' })).toBeInTheDocument()
  })

  it('stops Find agent with the prompt, and searches a place only when the customer picks one', async () => {
    const user = userEvent.setup()
    phone((_ok, fail) => fail({ code: 1 }))
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [{ name: 'Aberdeen', lat: '8.4842', lon: '-13.2711', address: { suburb: 'Aberdeen', city: 'Freetown' } }] })))
    renderHome()
    await screen.findByText('Location is blocked for this app.')
    await user.click(screen.getByRole('button', { name: 'Find agent' }))
    const sheet = await screen.findByRole('dialog', { name: 'Turn on your location' })
    expect(screen.queryByTestId('loc')).not.toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Search a place instead' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search a place' }), 'Aberdeen')
    await user.click(await screen.findByRole('button', { name: /Aberdeen/ }))
    await user.click(screen.getByRole('button', { name: 'Find agent' }))
    // The chosen place's own point goes with the search, marked as a place, never a guess.
    expect(screen.getByTestId('loc')).toHaveTextContent('/search?tx=cash_out&area=Aberdeen&lat=8.484&lng=-13.271&by=place')
  })

  it('says when the fix is only approximate, and carries that into the results', async () => {
    const user = userEvent.setup()
    phone((ok) => ok({ coords: { latitude: 8.4701, longitude: -13.2609, accuracy: 1800 } }))
    renderHome()
    expect(await screen.findByText(/approximate, move outside for a better fix/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Find agent' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('lat=8.47&lng=-13.261&rough=1')
  })

  it('searches around the phone as soon as the customer turns location on', async () => {
    const user = userEvent.setup()
    let on = false
    phone((ok, fail) => (on ? ok({ coords: { latitude: 8.4701, longitude: -13.2609 } }) : fail({ code: 2 })))
    renderHome()
    await screen.findByText('Location is switched off on this phone.')
    await user.click(screen.getByRole('button', { name: 'Find agent' }))
    const sheet = await screen.findByRole('dialog', { name: 'Turn on your location' })
    on = true
    await user.click(within(sheet).getByRole('button', { name: 'Turn on location' }))
    expect(await screen.findByTestId('loc')).toHaveTextContent('/search?tx=cash_out&area=Your+location&lat=8.47&lng=-13.261')
  })

  it('waits for a slow fix rather than searching around the area', async () => {
    const user = userEvent.setup()
    let answer: ((p: unknown) => void) | null = null
    phone((ok) => {
      answer = ok
    })
    renderHome()
    await screen.findByText('Finding your location…')
    await user.click(screen.getByRole('button', { name: 'Find agent' }))
    expect(screen.queryByTestId('loc')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Waiting for your location…' })).toBeDisabled()
    answer!({ coords: { latitude: 8.4701, longitude: -13.2609 } })
    expect(await screen.findByTestId('loc')).toHaveTextContent('lat=8.47&lng=-13.261')
  })
})

describe('U1 — Home names where the customer is', () => {
  function phoneAt(lat: number, lng: number) {
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: lat, longitude: lng } }) } })
  }

  it('shows the live place instead of a fixed area and carries it into the search', async () => {
    const user = userEvent.setup()
    phoneAt(8.4701, -13.2609)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ address: { neighbourhood: 'Lumley Beach', city: 'Freetown' } }) })))
    renderHome()
    expect(await screen.findByText('Lumley Beach')).toBeInTheDocument()
    expect(screen.queryByText('Lumley')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Find agent' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/search?tx=cash_out&area=Lumley+Beach&lat=8.47&lng=-13.261')
    sessionStorage.clear()
  })

  it('lets the customer search a place by hand, remembers it, then comes back to the live place', async () => {
    const user = userEvent.setup()
    phoneAt(8.4701, -13.2609)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [{ name: 'Aberdeen', lat: '8.4842', lon: '-13.2711', address: { suburb: 'Aberdeen', city: 'Freetown' } }] })))
    renderHome()
    await screen.findByText(/Searching around your location/)
    await user.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.queryByRole('radio', { name: 'Lumley' })).not.toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: 'Search a place' }), 'Aberdeen')
    const hit = await screen.findByRole('button', { name: /Aberdeen/ })
    expect(hit).toHaveTextContent('Freetown')
    await user.click(hit)
    expect(screen.getByText(/Searching around Aberdeen/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Find agent' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/search?tx=cash_out&area=Aberdeen&lat=8.484&lng=-13.271&by=place')
    // Remembered on this phone for next time.
    expect(JSON.parse(localStorage.getItem('af.places') ?? '[]')).toHaveLength(1)
  })

  it('shows recent places first, and says so when the map does not know a place', async () => {
    const user = userEvent.setup()
    phoneAt(8.4701, -13.2609)
    localStorage.setItem('af.places', JSON.stringify([{ name: 'Bo', detail: 'Southern Province', lat: 7.955, lng: -11.74 }]))
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })))
    renderHome()
    await screen.findByText(/Searching around your location/)
    await user.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByText('Recent places')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bo/ })).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: 'Search a place' }), 'Nowhere village')
    expect(await screen.findByText(/The map does not know that place/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Bo/ })).not.toBeInTheDocument()
  })

  it('treats a search that came back from Edit marked as a place as the hand-picked place', async () => {
    const user = userEvent.setup()
    phoneAt(8.4701, -13.2609)
    render(
      <MemoryRouter initialEntries={['/find?tx=deposit&area=Aberdeen&amount=500&lat=8.484&lng=-13.271&by=place']}>
        <Routes>
          <Route path="/find" element={<HomePage />} />
          <Route path="/search" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/Searching around Aberdeen/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Use my location' }))
    expect(await screen.findByText(/Searching around your location/)).toBeInTheDocument()
  })
})
