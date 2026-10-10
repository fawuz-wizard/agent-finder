import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { ToastProvider } from '@/design'
import { SessionProvider } from '@/features/auth/SessionProvider'
import { SESSION_KEY } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import ProfilePage from './ProfilePage'

function renderProfile() {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 't', role: 'agent', name: "Fatmata's Shop", ref: 'Agent 024', permissions: [] }))
  return render(
    <ToastProvider>
      <SessionProvider>
        <MemoryRouter initialEntries={['/agent/profile']}>
          <Routes>
            <Route path="/agent/profile" element={<ProfilePage />} />
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
  it('shows four rows of the Orange record, the rest on request, never editable', async () => {
    renderProfile()
    await screen.findByText('Your Orange record')
    expect(screen.queryByText('Region')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: /see full record/i }))
    expect(screen.getByText('Region')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /address/i })).not.toBeInTheDocument()
  })

  it('sends a wrong record to the aggregator without touching the record', async () => {
    const user = userEvent.setup()
    renderProfile()
    await screen.findByText('Your Orange record')
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

  it('changes the PIN only with the current one, and signs out the other phones', async () => {
    const user = userEvent.setup()
    renderProfile()
    await screen.findByText('Security')
    await user.click(screen.getByRole('button', { name: /^change/i }))
    const sheet = screen.getByRole('dialog', { name: 'Change PIN' })
    await user.type(within(sheet).getByLabelText('Current PIN'), '9999')
    await user.type(within(sheet).getByLabelText('New PIN'), '2468')
    await user.type(within(sheet).getByLabelText('New PIN again'), '2468')
    await user.click(within(sheet).getByRole('button', { name: 'Change PIN' }))
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(/not correct/i)
    await user.clear(within(sheet).getByLabelText('Current PIN'))
    await user.type(within(sheet).getByLabelText('Current PIN'), '1234')
    await user.click(within(sheet).getByRole('button', { name: 'Change PIN' }))
    await screen.findByText('PIN changed.')
    await expect(operatorApi.signIn('Agent 024', '1234', 'agent')).rejects.toThrow(/not correct/i)
    await operatorApi.changePin('Agent 024', '2468', '1234')
    // Two phones signed in; one tap leaves only this one.
    expect(screen.getByText('Old phone · Tecno')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /sign out the other phones/i }))
    await waitFor(() => expect(screen.queryByText('Old phone · Tecno')).not.toBeInTheDocument())
  })

  it('keeps the two alert switches on this phone', async () => {
    const user = userEvent.setup()
    renderProfile()
    const beep = await screen.findByRole('switch', { name: 'Beep before closing' })
    expect(beep).toHaveAttribute('aria-checked', 'true')
    await user.click(beep)
    expect(screen.getByRole('switch', { name: 'Beep before closing' })).toHaveAttribute('aria-checked', 'false')
    expect(JSON.parse(localStorage.getItem('af.agentPrefs')!)).toMatchObject({ closingBeep: false, leftShopWatch: true })
  })
})
