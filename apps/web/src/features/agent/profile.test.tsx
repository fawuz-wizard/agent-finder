import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/design'
import { SessionProvider } from '@/features/auth/SessionProvider'
import { SESSION_KEY } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import ProfilePage from './ProfilePage'
import PersonalInfoPage from './PersonalInfoPage'
import ShopPage from './ShopPage'
import ChangePinPage from './ChangePinPage'
import NotificationSettingsPage from './NotificationSettingsPage'
import { AgentLayout } from '@/app/layouts'

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='
vi.mock('@/lib/photo', async (orig) => ({ ...(await orig<typeof import('@/lib/photo')>()), shrinkPhoto: vi.fn(async () => PHOTO) }))

function renderProfile(start = '/agent/profile') {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 't', role: 'agent', name: "Fatmata's Shop", ref: 'Agent 024', permissions: [] }))
  return render(
    <ToastProvider>
      <SessionProvider>
        <MemoryRouter initialEntries={[start]}>
          <Routes>
            <Route path="/agent/profile" element={<ProfilePage />} />
            <Route path="/agent/profile/personal" element={<PersonalInfoPage />} />
            <Route path="/agent/shop" element={<ShopPage />} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </ToastProvider>,
  )
}

function renderIn(path: string) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 't', role: 'agent', name: "Fatmata's Shop", ref: 'Agent 024', permissions: [] }))
  return render(
    <ToastProvider>
      <SessionProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<AgentLayout />}>
              <Route path="/agent/profile" element={<ProfilePage />} />
              <Route path="/agent/pin" element={<ChangePinPage />} />
              <Route path="/agent/notification-settings" element={<NotificationSettingsPage />} />
              <Route path="/agent/profile/personal" element={<PersonalInfoPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </ToastProvider>,
  )
}

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('agent profile', () => {
  it('photographs the shop, shows it, and can take it down again', async () => {
    const user = userEvent.setup()
    // The shop's photo and pin are on Your shop, from Service Status → Update Location.
    renderProfile('/agent/shop')
    await screen.findByText('Add a photo of your shop')
    expect(screen.queryByRole('img', { name: /photographed by you/i })).not.toBeInTheDocument()
    const input = screen.getByLabelText('Photo of your shop') as HTMLInputElement
    expect(input).toHaveAttribute('capture', 'environment')
    expect(input).toHaveAttribute('accept', 'image/*')
    await user.upload(input, new File([new Uint8Array([1, 2, 3])], 'shop.jpg', { type: 'image/jpeg' }))
    const img = await screen.findByRole('img', { name: "Fatmata's Shop, photographed by you" })
    expect(img).toHaveAttribute('src', PHOTO)
    expect(screen.getByText('Your shop, as customers see it')).toBeInTheDocument()
    // Live at once: the customers' listing and the aggregator's view carry it.
    expect((await operatorApi.home('Agent 024')).photo_url).toBe(PHOTO)
    expect((await operatorApi.dealerAgent('Agent 024')).photo).toBe(PHOTO)
    expect((await operatorApi.actions('Agent 024')).some((a) => a.action === 'photo' && /added the photo of Fatmata's Shop/.test(a.note))).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await screen.findByText('Add a photo of your shop')
    expect((await operatorApi.home('Agent 024')).photo_url).toBeNull()
  })


  it('opens each Profile row as its own page; Personal Information is the record in full, read only', async () => {
    const user = userEvent.setup()
    renderProfile()
    for (const [name, href] of [
      ['Personal Information', '/agent/profile/personal'] as const,
      ['Change PIN', '/agent/pin'],
      ['Notification Settings', '/agent/notification-settings'],
      ['Help & Support', '/agent/help'],
      ['About', '/agent/about'],
    ] as const)
      expect(await screen.findByRole('link', { name })).toHaveAttribute('href', href)
    await user.click(screen.getByRole('link', { name: 'Personal Information' }))
    const record = await screen.findByLabelText('Your record')
    expect(within(record).getByText('Agent number')).toBeInTheDocument()
    expect(within(record).getByText('024')).toBeInTheDocument()
    expect(within(record).getByText('Status at Orange')).toBeInTheDocument()
    expect(within(record).getByText(/^\+232 •• ••• \d{3}$/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /address/i })).not.toBeInTheDocument()
    // The shop's photo is not here any more.
    expect(screen.queryByText('Add a photo of your shop')).not.toBeInTheDocument()
  })

  it('sends a wrong record to the aggregator without touching the record', async () => {
    const user = userEvent.setup()
    renderProfile()
    await user.click(await screen.findByRole('link', { name: 'Personal Information' }))
    await screen.findByLabelText('Your record')
    const before = (await operatorApi.profile('Agent 024')).street
    await user.click(screen.getByRole('button', { name: 'Report a mistake' }))
    const sheet = screen.getByRole('dialog', { name: 'Report a mistake' })
    await user.click(within(sheet).getByRole('radio', { name: 'Address' }))
    await user.type(within(sheet).getByLabelText('What is wrong'), 'We moved to Lumley Beach Road')
    await user.click(within(sheet).getByRole('button', { name: 'Send to my aggregator' }))
    await screen.findByText(/Sent to your aggregator/)
    expect((await operatorApi.profile('Agent 024')).street).toBe(before)
    const acts = await operatorApi.actions('Agent 024')
    expect(acts.some((a) => a.action === 'agent_note' && /Lumley Beach Road/.test(a.note))).toBe(true)
  })

  it('Change PIN is its own page: the current PIN first, then the phones signed in', async () => {
    const user = userEvent.setup()
    renderIn('/agent/pin')
    await screen.findByRole('heading', { name: 'Change PIN' })
    await user.type(screen.getByLabelText('Current PIN'), '9999')
    await user.type(screen.getByLabelText('New PIN'), '2468')
    await user.type(screen.getByLabelText('New PIN again'), '2468')
    await user.click(screen.getByRole('button', { name: 'Save PIN' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/not correct/i)
    await user.clear(screen.getByLabelText('Current PIN'))
    await user.type(screen.getByLabelText('Current PIN'), '1234')
    await user.click(screen.getByRole('button', { name: 'Save PIN' }))
    await screen.findByText('PIN changed.')
    await expect(operatorApi.signIn('Agent 024', '1234', 'agent')).rejects.toThrow(/not correct/i)
    await operatorApi.changePin('Agent 024', '2468', '1234')
    // Two phones signed in; one tap leaves only this one.
    expect(await screen.findByText(/Old phone · Tecno/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /sign out the other phones/i }))
    await waitFor(() => expect(screen.queryByText(/Old phone · Tecno/)).not.toBeInTheDocument())
  })

  it('Notification Settings is its own page with the two alerts, on this phone only', async () => {
    const user = userEvent.setup()
    renderIn('/agent/notification-settings')
    await screen.findByRole('heading', { name: 'Notification Settings' })
    expect(screen.getAllByRole('switch')).toHaveLength(2)
    const beep = screen.getByRole('switch', { name: 'Closing reminder' })
    expect(beep).toHaveAttribute('aria-checked', 'true')
    await user.click(beep)
    expect(screen.getByRole('switch', { name: 'Closing reminder' })).toHaveAttribute('aria-checked', 'false')
    expect(JSON.parse(localStorage.getItem('af.agentPrefs')!)).toMatchObject({ closingBeep: false, leftShopWatch: true })
  })

  it('"Customers may call me" sits under the Phone line, off by default', async () => {
    const user = userEvent.setup()
    renderIn('/agent/profile/personal')
    const call = await screen.findByRole('switch', { name: 'Customers may call me' })
    const before = (await operatorApi.profile('Agent 024')).phone_visible
    expect(call).toHaveAttribute('aria-checked', String(before))
    await user.click(call)
    await waitFor(async () => expect((await operatorApi.profile('Agent 024')).phone_visible).toBe(!before))
    await operatorApi.setPhoneVisible('Agent 024', before)
  })
})


describe('the round picture is the shop photo', () => {
  it('the agent taps it on Profile to add the shop photo, which customers and the aggregator see, and can remove it', async () => {
    const user = userEvent.setup()
    await operatorApi.removePhoto('Agent 024')
    renderIn('/agent/profile')
    await user.click(await screen.findByRole('button', { name: 'Add your shop photo' }))
    const sheet = await screen.findByRole('dialog', { name: 'Shop photo' })
    expect(within(sheet).getByText(/customers and your aggregator see it/)).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument()
    await user.upload(screen.getByTestId('agent-photo-gallery'), new File([new Uint8Array([1, 2, 3])], 'shop.jpg', { type: 'image/jpeg' }))
    const changed = await screen.findByRole('button', { name: 'Change your shop photo' })
    expect(changed.querySelector('img')).toHaveAttribute('src', PHOTO)
    expect((await operatorApi.home('Agent 024')).photo_url).toBe(PHOTO)
    expect((await operatorApi.dealerAgent('Agent 024')).photo).toBe(PHOTO)
    await user.click(changed)
    await user.click(within(await screen.findByRole('dialog', { name: 'Shop photo' })).getByRole('button', { name: 'Remove photo' }))
    expect(await screen.findByRole('button', { name: 'Add your shop photo' })).toBeInTheDocument()
    expect((await operatorApi.home('Agent 024')).photo_url).toBeNull()
  })
})


describe('appearance', () => {
  it('sits at the top of Profile: opens light, and Dark turns the whole agent shell dark on this phone', async () => {
    const user = userEvent.setup()
    const { container } = renderIn('/agent/profile')
    const group = await screen.findByRole('radiogroup', { name: 'Appearance' })
    expect(container.querySelector('[data-platform="light"]')).not.toBeNull()
    expect(within(group).getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true')
    await user.click(within(group).getByRole('radio', { name: 'Dark' }))
    expect(container.querySelector('[data-platform="dark"]')).not.toBeNull()
    expect(container.querySelector('[data-platform="light"]')).toBeNull()
    expect(localStorage.getItem('af.platformTheme')).toBe('dark')
  })
})
