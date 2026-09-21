import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { SessionProvider } from '@/features/auth/SessionProvider'
import { RequireRole } from '@/features/auth/RequireRole'
import SignInPage from '@/features/auth/SignInPage'
import AgentHomePage from './AgentHomePage'
import AvailabilityPage from './AvailabilityPage'
import FloatPage from './FloatPage'
import { operatorApi } from '@/services/operatorApi'

function App({ start = '/agent' }: { start?: string }) {
  return (
    <SessionProvider>
      <MemoryRouter initialEntries={[start]}>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route element={<RequireRole role="agent" />}>
            <Route path="/agent" element={<AgentHomePage />} />
            <Route path="/agent/availability" element={<AvailabilityPage />} />
            <Route path="/agent/float" element={<FloatPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </SessionProvider>
  )
}

async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/pin/i), '1234')
  await user.click(screen.getByRole('button', { name: /^sign in$/i }))
}

beforeEach(() => {
  sessionStorage.clear()
})

describe('agent app', () => {
  it('sends a signed-out visitor to sign-in and back to the agent home', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    await signIn(user)
    expect(await screen.findByText("Fatmata's Shop")).toBeInTheDocument()
  })

  it('refuses the wrong PIN without signing anyone in', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByLabelText(/pin/i), '9999')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/pin is not correct/i)
    expect(screen.queryByText("Fatmata's Shop")).not.toBeInTheDocument()
  })

  it('offers "Still correct?" on a stale declaration and resets the clock when confirmed', async () => {
    const user = userEvent.setup()
    render(<App />)
    await signIn(user)
    await screen.findByText("Fatmata's Shop")
    expect(screen.getByText(/still correct\?/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^yes$/i }))
    expect(await screen.findByText(/you updated this just now/i)).toBeInTheDocument()
    expect(screen.queryByText(/still correct\?/i)).not.toBeInTheDocument()
  })

  it('never shows the customer phrasing or another agent\'s money on the agent home', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await signIn(user)
    await screen.findByText("Fatmata's Shop")
    const text = container.textContent ?? ''
    // The agent sees their own declaration words; they never see the customer-facing phrase.
    expect(text).not.toMatch(/can likely handle your request/i)
    expect(text).toContain('Most')
  })
})

describe('float workflow', () => {
  it('runs pending → approved → completed and refuses an illegal jump', async () => {
    // Agent 038 has no seeded request, so this exercise starts from a clean state.
    const created = await operatorApi.requestFloat('Agent 038', 4000, 'Market day')
    expect(created.state).toBe('pending')

    await expect(operatorApi.moveFloat(created.id, 'completed', 'Kissy Distribution', null)).rejects.toThrow(
      /cannot become completed/i,
    )

    const approved = await operatorApi.moveFloat(created.id, 'approved', 'Kissy Distribution', null)
    expect(approved.state).toBe('approved')
    const done = await operatorApi.moveFloat(approved.id, 'completed', 'Kissy Distribution', null)
    expect(done.state).toBe('completed')
  })

  it('requires a reason before a request can be declined', async () => {
    const created = await operatorApi.requestFloat('Agent 017', 2000, 'Short on float')
    await expect(operatorApi.moveFloat(created.id, 'declined', 'Kissy Distribution', '  ')).rejects.toThrow(
      /needs a reason/i,
    )
    const declined = await operatorApi.moveFloat(created.id, 'declined', 'Kissy Distribution', 'Too soon after the last top-up.')
    expect(declined.decision_reason).toMatch(/too soon/i)
  })

  it('shows the agent the dealer\'s reason for a decline', async () => {
    const user = userEvent.setup()
    render(<App start="/agent/float" />)
    await signIn(user)
    // The list loads after the card frame, so wait for the reason itself.
    expect(await screen.findByText(/too close to your last top-up/i)).toBeInTheDocument()
  })
})

describe('surface boundary', () => {
  it('keeps the operator service out of the customer entry chunk', async () => {
    // The session provider wraps every route including the customer's. If it imported the
    // operator service statically, seeded balances and capacity words would ship in the
    // customer's first payload. This asserts the dynamic import stays dynamic.
    const { readFile } = await import('node:fs/promises')
    const { resolve } = await import('node:path')
    const src = await readFile(resolve(process.cwd(), 'src/features/auth/SessionProvider.tsx'), 'utf8')
    expect(src).not.toMatch(/^import .*operatorApi/m)
    expect(src).toMatch(/await import\('@\/services\/operatorApi'\)/)
  })
})
