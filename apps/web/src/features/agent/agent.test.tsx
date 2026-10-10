import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { ToastProvider } from '@/design'
import { SessionProvider } from '@/features/auth/SessionProvider'
import { RequireRole } from '@/features/auth/RequireRole'
import SignInPage from '@/features/auth/SignInPage'
import DashboardPage from './DashboardPage'
import { floatRowText } from './floatRow'
import ServicesPage from './ServicesPage'
import HoursPage from './HoursPage'
import { operatorApi } from '@/services/operatorApi'
import { demoRecordVisit, demoSetOperatorFeed, demoSetUnlocated } from '@/services/operatorDemo'

function App({ start = '/agent' }: { start?: string }) {
  return (
    <ToastProvider>
    <SessionProvider>
      <MemoryRouter initialEntries={[start]}>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route element={<RequireRole role="agent" />}>
            <Route path="/agent" element={<DashboardPage />} />
            <Route path="/agent/services" element={<ServicesPage />} />
            <Route path="/agent/profile" element={<p>profile</p>} />
            <Route path="/agent/hours" element={<HoursPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </SessionProvider>
    </ToastProvider>
  )
}

async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/agent code/i), 'Agent 024')
  await user.type(screen.getByLabelText(/^pin$/i), '1234')
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
    expect((await screen.findAllByText("Fatmata's Shop")).length).toBeGreaterThan(0)
  })

  it('refuses the wrong PIN without signing anyone in', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByLabelText(/agent code/i), 'Agent 024')
    await user.type(screen.getByLabelText(/^pin$/i), '9999')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/pin is not correct/i)
    expect(screen.queryAllByText("Fatmata's Shop")).toHaveLength(0)
  })

  it('never asks the agent to refresh or to pick a word: presence and hours only', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await signIn(user)
    await screen.findAllByText("Fatmata's Shop")
    expect(screen.queryByText(/still correct\?/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Refresh status')).not.toBeInTheDocument()
    expect(screen.getByText(/open · serving/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /working hours/i })).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\bMost\b|\bSome\b|\bSmall\b/)
  })

  it('shows the agent exactly what customers now see, from evidence, never their money', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await signIn(user)
    await screen.findAllByText("Fatmata's Shop")
    const card = screen.getByText(/customers now see/i).closest('div')!
    // Compact by default: one short pill per side; the full wording on request.
    expect(within(card).getByText('Cash out')).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: /what they read/i }))
    expect(within(card).getAllByText(/can likely handle your request/i).length).toBe(2)
    expect(within(card).getByText(/^any amount$/)).toBeInTheDocument()
    expect(within(card).getByText(/^up to SLE 10,000$/)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/SLE 21,000/)
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
    render(<App start="/agent/services" />)
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
      await screen.findAllByText("Fatmata's Shop")
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
    // The title shows while loading; the week's rows mean the schedule has arrived.
    await screen.findByText(/every week/i)
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
    await screen.findAllByText("Fatmata's Shop")
    expect(await screen.findByText(/closing at 12:10 by your schedule/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /stay open 1 more hour/i }))
    await screen.findByText(/staying open until 13:10/)
    // The timeline may log the extension before the day's card has re-read; wait for the card.
    await waitFor(() => expect(screen.queryByText(/closing at 12:10 by your schedule/i)).not.toBeInTheDocument())
    await operatorApi.setToday('Agent 024', { clear: true })
  })
})

describe('transaction log', () => {
  it('recording a transaction asks what Orange asks, counts on Services and lands on the timeline', async () => {
    const user = userEvent.setup()
    render(<App start="/agent/services" />)
    await signIn(user)
    const counter = await screen.findByText(/Logged today: \d+/)
    const before = Number(counter.textContent!.match(/\d+/)![0])
    await user.click(screen.getByRole('radio', { name: 'Cash in' }))
    // Cash in asks what Orange asks: the customer's number, then the amount.
    await user.type(screen.getByLabelText("Customer's number"), '076 123 456')
    await user.type(screen.getByLabelText('Amount (SLE)'), '2000')
    await user.click(screen.getByRole('button', { name: 'Record cash in' }))
    expect(await screen.findByText(`Logged today: ${before + 1}`)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Recorded · Cash in · SLE 2,000 · +SLE 15 commission')
    // The form folds away until the next side is chosen.
    expect(screen.queryByRole('button', { name: 'Record cash in' })).not.toBeInTheDocument()
    const acts = await operatorApi.activity('Agent 024')
    expect(acts.some((a) => a.text === 'You recorded: Cash in · SLE 2,000')).toBe(true)
    // The customer's number never appears anywhere the agent can read it back.
    expect(acts.every((a) => !/076|123 456/.test(a.text))).toBe(true)
    // Cash out asks only for the amount.
    await user.click(screen.getByRole('radio', { name: 'Cash out' }))
    expect(screen.queryByLabelText("Customer's number")).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Amount (SLE)'), '800')
    await user.click(screen.getByRole('button', { name: 'Record cash out' }))
    expect(await screen.findByText(`Logged today: ${before + 2}`)).toBeInTheDocument()
  })
})

describe('the listing on the dashboard', () => {
  it('greys the listing and shows the headline when the agent steps away, and comes back on Open', async () => {
    const user = userEvent.setup()
    render(<App />)
    await signIn(user)
    await screen.findAllByText("Fatmata's Shop")
    const card = () => screen.getByRole('article', { name: /your listing/i })
    expect(card()).toHaveAttribute('data-state', 'open')
    expect(within(card()).getByText('Cash out')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Away' }))
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'hidden'))
    expect(within(card()).getByText('Availability hidden')).toBeInTheDocument()
    expect(within(card()).queryByText('Cash out')).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Open' }))
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'open'))
  })

  it('tells an agent who is not on the map yet, with the way to pin the shop', async () => {
    demoSetUnlocated('Agent 024', true)
    try {
      const user = userEvent.setup()
      render(<App />)
      await signIn(user)
      await screen.findByText('Not on the map yet')
      expect(screen.getByRole('article', { name: /your listing/i })).toHaveAttribute('data-state', 'unlocated')
      expect(screen.getByRole('link', { name: 'Pin my shop' })).toHaveAttribute('href', '/agent/profile')
    } finally {
      demoSetUnlocated('Agent 024', false)
    }
  })

  it('names the float request by its latest state, for a day', () => {
    const base = { id: 'f', agent_ref: 'Agent 024', agent_name: 'x', amount_sle: 1, reason: '', requested_at: new Date().toISOString(), waiting_text: '', decided_at: null, decided_by: null, decision_reason: null, ageing: false }
    const now = Date.now()
    expect(floatRowText(null)).toBe('Request float')
    expect(floatRowText({ ...base, state: 'pending' })).toBe('Pending')
    expect(floatRowText({ ...base, state: 'approved', decided_at: new Date(now - 3 * 86_400_000).toISOString() })).toBe('Approved')
    expect(floatRowText({ ...base, state: 'declined', decided_at: new Date(now - 3_600_000).toISOString() }, now)).toBe('Declined')
    expect(floatRowText({ ...base, state: 'completed', decided_at: new Date(now - 3_600_000).toISOString() }, now)).toBe('Completed')
    expect(floatRowText({ ...base, state: 'declined', decided_at: new Date(now - 2 * 86_400_000).toISOString() }, now)).toBe('Request float')
    expect(floatRowText({ ...base, state: 'cancelled', decided_at: new Date(now - 60_000).toISOString() }, now)).toBe('Request float')
  })
})

describe("today's commission on the dashboard", () => {
  it('shows what the day earned, as one tap to Activity', async () => {
    const user = userEvent.setup()
    render(<App />)
    await signIn(user)
    const link = await screen.findByRole('link', { name: /today's commission/i })
    await waitFor(() => expect(link).toHaveTextContent(/SLE \d/))
    expect(link).toHaveAttribute('href', '/agent/activity')
  })
})
