import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '@/features/auth/SessionProvider'
import { SESSION_KEY } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { ShopPresenceWatch } from './ShopPresence'

function phoneAt(lat: number, lng: number) {
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: lat, longitude: lng, accuracy: 20 } }) },
  })
}

function renderWatch() {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 't', role: 'agent', name: "Fatmata's Shop", ref: 'Agent 024', permissions: [] }))
  return render(
    <SessionProvider>
      <MemoryRouter>
        <ShopPresenceWatch />
      </MemoryRouter>
    </SessionProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('have you left the shop?', () => {
  it('stays quiet at the shop', async () => {
    // The demo's agent has no pin until one is set; stand at the shop and pin it.
    const profile = await operatorApi.setLocation('Agent 024', 8.4405, -13.2795)
    phoneAt(profile.lat!, profile.lng!)
    renderWatch()
    await new Promise((r) => setTimeout(r, 600))
    expect(screen.queryByText(/left the shop/i)).not.toBeInTheDocument()
  })

  it('asks when the phone is far from the pin, and sets Away on request, with a way back', async () => {
    const profile = await operatorApi.setLocation('Agent 024', 8.4405, -13.2795)
    phoneAt(profile.lat! + 0.01, profile.lng!) // about 1.1 km north
    const user = userEvent.setup()
    renderWatch()
    expect(await screen.findByText('Have you left the shop?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Set me Away' }))
    await waitFor(async () => expect((await operatorApi.home('Agent 024')).declaration.presence).toBe('hidden'))
    // Not an automatic Away: no "you left the shop" card, the Dashboard's pills say Away.
    expect(screen.queryByText(/Away · you left the shop/)).not.toBeInTheDocument()
    await operatorApi.declare('Agent 024', { presence: 'open', night_mode: true })
  })
})
