import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { SessionProvider } from '@/features/auth/SessionProvider'
import { RequireRole } from '@/features/auth/RequireRole'
import SignInPage from '@/features/auth/SignInPage'
import AgentHomePage from './AgentHomePage'
import AvailabilityPage from './AvailabilityPage'
import FloatPage from './FloatPage'
import HoursPage from './HoursPage'
import { operatorApi } from '@/services/operatorApi'
import { demoRecordVisit, demoSetOperatorFeed } from '@/services/operatorDemo'

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
          <Route path="/agent/hours" element={<HoursPage />} />
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
    // While the prompt is due, the quiet refresh stays out of the way.
    expect(screen.queryByText('Refresh status')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^yes$/i }))
    expect(await screen.findByText(/you updated this just now/i)).toBeInTheDocument()
    expect(screen.queryByText(/still correct\?/i)).not.toBeInTheDocument()
  })

  it('shows the agent exactly what customers now see, phrased from their own words', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await signIn(user)
    await screen.findByText("Fatmata's Shop")
    // Fatmata declared Most / Some. Cash out has no ceiling; deposit is capped by the network range.
    const card = screen.getByText(/customers now see/i).closest('div')!
    expect(within(card).getAllByText(/can likely handle your request/i).length).toBe(2)
    expect(within(card).getByText(/· any amount/)).toBeInTheDocument()
    expect(within(card).getByText(/· up to SLE 10,000/)).toBeInTheDocument()
    expect(within(card).getByText(/above that: limited/i)).toBeInTheDocument()
    // The agent still sees their own words, and never another agent's money.
    expect(container.textContent).toContain('Most')
    expect(container.textContent).not.toMatch(/SLE 21,000/)
  })

  it('offers "Refresh status" whenever "Still correct?" is not due, and it resets the clock', async () => {
    // A fresh declaration with the same words: nothing is due, so the quiet refresh is offered.
    await operatorApi.declare('Agent 024', { presence: 'open', cash_out: 'most', deposit: 'some', night_mode: true })
    const user = userEvent.setup()
    render(<App />)
    await signIn(user)
    await screen.findByText("Fatmata's Shop")
    const refreshBtn = await screen.findByText('Refresh status')
    expect(screen.queryByText(/still correct\?/i)).not.toBeInTheDocument()
    await user.click(refreshBtn)
    expect(await screen.findByText(/you updated this just now/i)).toBeInTheDocument()
    expect(await screen.findByText('Refresh status')).toBeInTheDocument()
  })

  it('turns the card into one headline when the agent is hidden', async () => {
    await operatorApi.declare('Agent 031', { presence: 'hidden', cash_out: 'some', deposit: 'small', night_mode: false })
    const home = await operatorApi.home('Agent 031')
    expect(home.customers_see).toMatchObject({ state: 'hidden', headline: 'Availability hidden', sides: [] })
    await operatorApi.declare('Agent 031', { presence: 'open', cash_out: 'some', deposit: 'small', night_mode: false })
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

describe('predictive availability', () => {
  it('a figure picks the word, and confirmed visits move what customers see', async () => {
    const d = await operatorApi.declare('Agent 024', {
      presence: 'open',
      cash_out: 'most',
      deposit: 'some',
      cash_out_sle: 5000,
      night_mode: true,
    })
    expect(d.cash_out).toBe('some')
    expect(d.cash_out_sle).toBe(5000)
    let home = await operatorApi.home('Agent 024')
    expect(home.customers_see.sides[0]!).toMatchObject({ range_text: 'up to SLE 5,000', estimate_text: 'You said up to SLE 5,000' })

    demoRecordVisit("Fatmata's Shop", 'cash_out', 3000, 'yes', null) // ≤5k band → 3,500 moved
    home = await operatorApi.home('Agent 024')
    expect(home.customers_see.sides[0]!.range_text).toBe('up to SLE 1,500')
    expect(home.customers_see.sides[0]!.estimate_text).toContain('1 confirmed visit since · about SLE 1,500 left')
    expect(home.declaration.cash_out_sle).toBe(5000) // the agent's own figure is untouched
  })

  it('a failed visit caps the side, names why, and "Yes" folds the estimate into the figure', async () => {
    demoRecordVisit("Fatmata's Shop", 'cash_out', 1000, 'no', 'could_not_complete') // ≤2k band → cap 501
    const home = await operatorApi.home('Agent 024')
    expect(home.customers_see.sides[0]!.range_text).toBe('up to SLE 500')
    expect(home.customers_see.sides[0]!.why).toMatch(/failed cash out of SLE 500 to 2,000/)
    expect(home.declaration.confirm_due).toBe(true)
    expect(home.declaration.confirm_reason).toMatch(/until you refresh/)

    const user = userEvent.setup()
    render(<App />)
    await signIn(user)
    await screen.findByText("Fatmata's Shop")
    expect(screen.getByText(/still correct\?/i)).toBeInTheDocument()
    expect(screen.getAllByText(/failed cash out of SLE 500 to 2,000/).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: /^yes$/i }))
    expect(await screen.findByText(/you updated this just now/i)).toBeInTheDocument()
    const after = await operatorApi.home('Agent 024')
    expect(after.declaration.cash_out_sle).toBe(1500)
    expect(after.declaration.cash_out).toBe('some')
    expect(after.declaration.confirm_reason).toBeNull()
    expect(after.customers_see.sides[0]!.range_text).toBe('up to SLE 1,500')
  })

  it('typing a figure on the form selects the matching word', async () => {
    const user = userEvent.setup()
    render(<App start="/agent/availability" />)
    await signIn(user)
    const cash = await screen.findByLabelText(/right now/i)
    expect(cash).toBeInTheDocument()
    const figure = screen.getAllByLabelText(/up to about \(SLE\)/i)[0]!
    await user.clear(figure)
    await user.type(figure, '12000')
    const grid = screen.getByRole('radiogroup', { name: /cash out/i })
    expect(within(grid).getByRole('radio', { name: /most/i })).toHaveAttribute('aria-checked', 'true')
    await user.clear(figure)
    await user.type(figure, '300')
    expect(within(grid).getByRole('radio', { name: /small/i })).toHaveAttribute('aria-checked', 'true')
    // Back to the seeded words so later files see the same Fatmata.
    await operatorApi.declare('Agent 024', { presence: 'open', cash_out: 'most', deposit: 'some', night_mode: true })
  })
})

describe('operator feed (demo)', () => {
  it('reads capacity from the feed, retires the refresh prompt, and keeps presence with the agent', async () => {
    demoSetOperatorFeed(true)
    try {
      const home = await operatorApi.home('Agent 024')
      expect(home.declaration.capacity_source).toBe('operator')
      expect(home.declaration.confirm_due).toBe(false)
      expect(home.declaration.freshness_text).toMatch(/nothing to refresh/)
      expect(home.customers_see.explanation).toMatch(/Orange \(demo\) position/)
      // Midday pinned clock: 5/13 of the day drawn from 12,400 leaves 8,347 → "some".
      expect(home.declaration.cash_out).toBe('some')
      expect(home.customers_see.sides[0]!.range_text).toBe('up to SLE 8,347')

      const user = userEvent.setup()
      render(<App />)
      await signIn(user)
      await screen.findByText("Fatmata's Shop")
      expect(await screen.findByText(/nothing to refresh/)).toBeInTheDocument()
      expect(screen.queryByText('Refresh status')).not.toBeInTheDocument()
      expect(screen.queryByText(/still correct\?/i)).not.toBeInTheDocument()
      expect(screen.getByText(/e-float exact/i)).toBeInTheDocument()

      await operatorApi.declare('Agent 024', { presence: 'hidden', cash_out: 'most', deposit: 'some', night_mode: true })
      expect((await operatorApi.home('Agent 024')).customers_see.state).toBe('hidden')
    } finally {
      await operatorApi.declare('Agent 024', { presence: 'open', cash_out: 'most', deposit: 'some', night_mode: true })
      demoSetOperatorFeed(false)
    }
  })
})

describe('working hours', () => {
  it('the weekly pattern and today-only changes are the agent\'s, and customers follow them', async () => {
    const user = userEvent.setup()
    render(<App start="/agent/hours" />)
    await signIn(user)
    await screen.findByText(/working hours/i)
    expect(screen.getAllByRole('checkbox', { name: /closed$/i })).toHaveLength(7)
    await user.click(screen.getByRole('checkbox', { name: /sunday closed/i }))
    await user.click(screen.getByRole('button', { name: /save weekly hours/i }))
    expect((await operatorApi.schedule('Agent 024')).weekly.sun).toBeNull()

    const half = await operatorApi.setToday('Agent 024', { hours: ['08:00', '12:10'] })
    expect(half.today.today_only).toBe(true)
    // The pinned clock is midday: ten minutes to the close, so the home screen warns.
    const home = await operatorApi.home('Agent 024')
    expect(home.schedule.notice).toMatch(/closing at 12:10 by your schedule in \d+ min\. stay open\?/i)
    const after = await operatorApi.setToday('Agent 024', { extend_minutes: 60 })
    expect(after.today.closes_at).toBe('13:10')
    expect(after.today.notice).toBeNull()
    expect(after.today.hours_text).toMatch(/staying open until 13:10/)
    const back = await operatorApi.setToday('Agent 024', { clear: true })
    expect(back.today.today_only).toBe(false)
    await operatorApi.setSchedule('Agent 024', { ...back.weekly, sun: ['07:00', '20:00'] })
  })

  it('shows the closing warning on the home screen with one tap to stay open', async () => {
    await operatorApi.setToday('Agent 024', { hours: ['08:00', '12:10'] })
    const user = userEvent.setup()
    render(<App />)
    await signIn(user)
    await screen.findByText("Fatmata's Shop")
    expect(await screen.findByText(/closing at 12:10 by your schedule/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /stay open 1 more hour/i }))
    await screen.findByText(/staying open until 13:10/)
    expect(screen.queryByText(/closing at 12:10 by your schedule/i)).not.toBeInTheDocument()
    await operatorApi.setToday('Agent 024', { clear: true })
  })
})
