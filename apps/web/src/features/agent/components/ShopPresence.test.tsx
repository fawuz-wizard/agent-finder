import { render, screen, waitFor } from '@testing-library/react'
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

describe('checked in at the pin, never asked', () => {
  it('at the shop: checks in quietly and stays visible', async () => {
    const profile = await operatorApi.setLocation('Agent 024', 8.4405, -13.2795)
    phoneAt(profile.lat!, profile.lng!)
    renderWatch()
    await waitFor(async () => expect((await operatorApi.home('Agent 024')).checkin?.hidden_reason).toBeNull(), { timeout: 5000 })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect((await operatorApi.home('Agent 024')).customers_see.state).not.toBe('hidden')
  })

  it('away from the pin: hidden at once with no question, and shown again on return', async () => {
    localStorage.removeItem('af.shopAlerts')
    const profile = await operatorApi.setLocation('Agent 024', 8.4405, -13.2795)
    phoneAt(profile.lat! + 0.01, profile.lng!) // about 1.1 km north
    const first = renderWatch()
    await waitFor(async () => expect((await operatorApi.home('Agent 024')).checkin?.hidden_reason).toBe('away_from_pin'), { timeout: 5000 })
    // Nothing to press: no card, no buttons. The bell says what happened.
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect((await operatorApi.home('Agent 024')).customers_see.state).toBe('hidden')
    expect((await operatorApi.home('Agent 024')).declaration.presence).toBe('open')
    expect(JSON.parse(localStorage.getItem('af.shopAlerts') ?? '[]').some((a: { kind: string }) => a.kind === 'left')).toBe(true)
    // The aggregator reads why, without a distance.
    const detail = await operatorApi.dealerAgent('Agent 024')
    expect(detail.checkin_text).toMatch(/^Hidden · away from the pin since \d{2}:\d{2}$/)
    first.unmount()
    phoneAt(profile.lat!, profile.lng!)
    renderWatch()
    await waitFor(async () => expect((await operatorApi.home('Agent 024')).checkin?.hidden_reason).toBeNull(), { timeout: 5000 })
    expect(JSON.parse(localStorage.getItem('af.shopAlerts') ?? '[]').some((a: { kind: string }) => a.kind === 'back')).toBe(true)
    localStorage.removeItem('af.shopAlerts')
  })
})
