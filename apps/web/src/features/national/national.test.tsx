import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { SessionProvider } from '@/features/auth/SessionProvider'
import { RequireRole } from '@/features/auth/RequireRole'
import SignInPage from '@/features/auth/SignInPage'
import { SESSION_KEY } from '@/features/auth/session'
import NationalSignInPage from './NationalSignInPage'
import { RequireNational } from './RequireNational'

function App({ start }: { start: string }) {
  return (
    <SessionProvider>
      <MemoryRouter initialEntries={[start]}>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/national/sign-in" element={<NationalSignInPage />} />
          <Route path="/national" element={<RequireNational />}>
            <Route index element={<p>national map</p>} />
          </Route>
          <Route path="/dealer" element={<RequireRole role="dealer" />}>
            <Route index element={<p>aggregator home</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </SessionProvider>
  )
}

async function appSignIn(user: ReturnType<typeof userEvent.setup>, who: string, pin: string) {
  await user.type(await screen.findByLabelText(/^phone number$/i), who)
  await user.click(screen.getByRole('button', { name: /^continue$/i }))
  await user.type(await screen.findByLabelText(/^pin$/i), pin)
  await user.click(screen.getByRole('button', { name: /^sign in$/i }))
}

async function nationalSignIn(user: ReturnType<typeof userEvent.setup>, who: string, pin: string) {
  await user.type(await screen.findByLabelText('Account'), who)
  await user.type(screen.getByLabelText('6-digit PIN'), pin)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

beforeEach(() => sessionStorage.clear())

describe("Orange's national map has its own page", () => {
  it('the Agent App refuses the Orange account and keeps no session', async () => {
    const user = userEvent.setup()
    render(<App start="/sign-in" />)
    await appSignIn(user, 'orange', '123456')
    expect(await screen.findByRole('alert')).toHaveTextContent('This account opens on the national map page, not in this app.')
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('the national page opens the map for Orange with its 6-digit PIN', async () => {
    const user = userEvent.setup()
    render(<App start="/national" />)
    await nationalSignIn(user, 'orange', '123456')
    expect(await screen.findByText('national map')).toBeInTheDocument()
  })

  it('the national page refuses an aggregator, who still signs in to the Agent App', async () => {
    const user = userEvent.setup()
    render(<App start="/national/sign-in" />)
    await nationalSignIn(user, 'kissy', '1234')
    expect(await screen.findByRole('alert')).toHaveTextContent("This page is for Orange's national account only.")
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('a national session that lands in the Agent App is sent to its own page', async () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 't', role: 'dealer', name: 'Orange Sierra Leone', ref: 'orange', permissions: ['VIEW_AGENT', 'VIEW_NATIONAL'] }))
    render(<App start="/dealer" />)
    expect(await screen.findByText('national map')).toBeInTheDocument()
    expect(screen.queryByText('aggregator home')).not.toBeInTheDocument()
  })
})
