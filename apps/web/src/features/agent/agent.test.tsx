import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/design'
import { SessionProvider } from '@/features/auth/SessionProvider'
import { RequireRole } from '@/features/auth/RequireRole'
import SignInPage from '@/features/auth/SignInPage'
import ChoosePinPage from '@/features/auth/ChoosePinPage'
import DashboardPage from './DashboardPage'
import { floatRowText } from './floatRow'
import ServicesPage from './ServicesPage'
import ActivityPage from './ActivityPage'
import HoursPage from './HoursPage'
import StatusPage from './StatusPage'
import FloatPage from './FloatPage'
import { operatorApi } from '@/services/operatorApi'
import { demoRecordVisit, demoSetOperatorFeed, demoSetUnlocated } from '@/services/operatorDemo'

// The older scoring and the listing phrases; the 7-day rule has its own tests.
vi.mock('@/lib/config', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/config')>()
  return { ...mod, config: { ...mod.config, ranker: 'activity' } }
})

function App({ start = '/agent' }: { start?: string }) {
  return (
    <ToastProvider>
    <SessionProvider>
      <MemoryRouter initialEntries={[start]}>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/choose-pin" element={<ChoosePinPage />} />
          <Route element={<RequireRole role="agent" />}>
            <Route path="/agent" element={<DashboardPage />} />
            <Route path="/agent/services" element={<ServicesPage />} />
            <Route path="/agent/activity" element={<ActivityPage />} />
            <Route path="/agent/status" element={<StatusPage />} />
            <Route path="/agent/float" element={<FloatPage />} />
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
  await user.type(await screen.findByLabelText(/^phone number$/i), 'Agent 024')
  await user.click(screen.getByRole('button', { name: /^continue$/i }))
  await user.type(await screen.findByLabelText(/^pin$/i), '1234')
  await user.click(screen.getByRole('button', { name: /^sign in$/i }))
}

beforeEach(() => {
  sessionStorage.clear()
})

describe('agent app', () => {
  it('sends a signed-out visitor to sign-in and back to the agent home', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
    await signIn(user)
    expect((await screen.findAllByText("Fatmata's Shop")).length).toBeGreaterThan(0)
  })

  it('a one-time code opens only the Choose-PIN step; the PIN chosen there signs the agent in', async () => {
    const user = userEvent.setup()
    const { code, ref } = await operatorApi.registerAgent({
      ref: '140', person_name: 'Isatu Conteh', shop_name: "Isatu's Place", area: 'Lumley', street: 'By the roundabout', lat: 8.44, lng: -13.28,
      phone: '+232 76 555 140', phone_visible: false, open_time: '07:00', close_time: '20:00', usual_max_sle: null, usual_float_max_sle: null,
      usual_daily_transactions: null, verified: false,
    })
    render(<App />)
    await user.type(await screen.findByLabelText(/^phone number$/i), ref)
    await user.click(screen.getByRole('button', { name: /^continue$/i }))
    await user.type(await screen.findByLabelText(/^pin$/i), code)
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))
    // Not the dashboard: the PIN screen, and the dashboard route sends you back to it.
    expect(await screen.findByRole('heading', { name: /choose your pin/i })).toBeInTheDocument()
    expect(screen.queryAllByText("Isatu's Place")).toHaveLength(0)
    await user.type(screen.getByLabelText(/^new pin$/i), '2468')
    await user.type(screen.getByLabelText(/same pin again/i), '2460')
    await user.click(screen.getByRole('button', { name: /save pin/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/not the same/i)
    await user.clear(screen.getByLabelText(/same pin again/i))
    await user.type(screen.getByLabelText(/same pin again/i), '2468')
    await user.click(screen.getByRole('button', { name: /save pin/i }))
    expect((await screen.findAllByText("Isatu's Place")).length).toBeGreaterThan(0)
    // The session is settled: a refresh lands on the dashboard, not the PIN screen again.
    expect(JSON.parse(sessionStorage.getItem('af.session')!)).toMatchObject({ ref, must_set_pin: false })
    await expect(operatorApi.signIn(ref, code, 'agent')).rejects.toThrow(/PIN/)
  })

  it('refuses the wrong PIN without signing anyone in', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByLabelText(/^phone number$/i), 'Agent 024')
    await user.click(screen.getByRole('button', { name: /^continue$/i }))
    await user.type(await screen.findByLabelText(/^pin$/i), '9999')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/pin is not correct/i)
    expect(screen.queryAllByText("Fatmata's Shop")).toHaveLength(0)
  })

  // Off screen in the new agent design's first pass (2026-11-01): this part is not in the design file yet. Restore with it.
  it.skip('never asks the agent to refresh or to pick a word: presence and hours only', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await signIn(user)
    await screen.findAllByText("Fatmata's Shop")
    expect(screen.queryByText(/still correct\?/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Refresh status')).not.toBeInTheDocument()
    expect(screen.getByText(/open · customers can find you/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /opening hours/i })).toHaveAttribute('href', '/agent/hours')
    expect(container.textContent).not.toMatch(/\bMost\b|\bSome\b|\bSmall\b/)
  })

  // Off screen in the new agent design's first pass (2026-11-01): this part is not in the design file yet. Restore with it.
  it.skip('shows the agent exactly what customers now see, from evidence, never their money', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await signIn(user)
    await screen.findAllByText("Fatmata's Shop")
    const card = screen.getByText(/customers now see/i).closest('div')!
    // Compact by default: one short pill per side; the full wording on request.
    expect(within(card).getByText('Cash out')).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: /what they read/i }))
    expect(within(card).getAllByText(/likely to serve you/i).length).toBe(2)
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

  // Off screen in the new agent design's first pass (2026-11-01): this part is not in the design file yet. Restore with it.
  it.skip('shows the agent the dealer\'s reason for a decline', async () => {
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

})

describe('operator feed (demo)', () => {
  // Off screen in the new agent design's first pass (2026-11-01): this part is not in the design file yet. Restore with it.
  it.skip('reads capacity from the feed, retires the refresh prompt, and keeps presence with the agent', async () => {
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

  // Off screen in the new agent design's first pass (2026-11-01): this part is not in the design file yet. Restore with it.
  it.skip('shows the closing warning on the home screen with one tap to stay open', async () => {
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
  it('Do Transaction records a cash in in two steps: number and amount, then the PIN; and lands on the timeline', async () => {
    const user = userEvent.setup()
    render(<App start="/agent/services" />)
    await signIn(user)
    const counter = await screen.findByText(/Logged today: \d+/)
    const before = Number(counter.textContent!.match(/\d+/)![0])
    // Cash in is the default; cash out is one tap away.
    expect(screen.getByRole('radio', { name: 'Cash in' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Cash out' })).toHaveAttribute('aria-checked', 'false')
    // 1 · The customer's number and the amount together; no name is looked up, never a balance.
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    await user.type(screen.getByLabelText('Customer phone number'), '76 123 456')
    expect(screen.getByText('Orange Money number')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '1,000' }))
    await user.clear(screen.getByLabelText('Amount (SLE)'))
    await user.type(screen.getByLabelText('Amount (SLE)'), '2000')
    expect(screen.queryByText(/balance/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    // 2 · Check, then the agent's own PIN: a wrong one is refused and nothing is recorded.
    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument()
    const check = screen.getByLabelText('Check')
    expect(within(check).getByText('+232 76 123 456')).toBeInTheDocument()
    expect(within(check).getByText('SLE 2,000')).toBeInTheDocument()
    for (const k of '9999') await user.click(screen.getByRole('button', { name: k }))
    await user.click(screen.getByRole('button', { name: 'Record' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/PIN is not correct/)
    for (const k of '1234') await user.click(screen.getByRole('button', { name: k }))
    await user.click(screen.getByRole('button', { name: 'Record' }))
    // Recorded, with our own record number, the masked number and Share Receipt.
    expect(await screen.findByText('Cash in recorded')).toBeInTheDocument()
    expect(screen.getByText(/^AF-[0-9A-F]{6}$/)).toBeInTheDocument()
    expect(screen.getAllByText('+232 •• ••• 456').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Share Receipt' })).toBeInTheDocument()
    const acts = await operatorApi.activity('Agent 024')
    expect(acts.some((a) => a.text === 'You recorded: Cash in · SLE 2,000')).toBe(true)
    expect(acts.every((a) => !/076|123 456/.test(a.text))).toBe(true)
    // Record another starts the next one empty, at step 1.
    await user.click(screen.getByRole('button', { name: 'Record another' }))
    expect(await screen.findByText(`Logged today: ${before + 1}`)).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    expect(screen.getByLabelText('Customer phone number')).toHaveValue('')
  })

  it('Do Transaction records a cash out the same way, so the 7-day rule sees both types', async () => {
    const user = userEvent.setup()
    render(<App start="/agent/services" />)
    await signIn(user)
    await screen.findByText(/Logged today: \d+/)
    await user.click(screen.getByRole('radio', { name: 'Cash out' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Cash out' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Customer phone number'), '77 555 321')
    await user.type(screen.getByLabelText('Amount (SLE)'), '3000')
    expect(screen.getByText('Give in cash')).toBeInTheDocument()
    expect(screen.queryByText('Collect in cash')).not.toBeInTheDocument()
    // The cash-out commission: SLE 3,000 is in the up-to-5,000 band, 50.
    expect(screen.getByText('SLE 50')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(within(screen.getByLabelText('Check')).getByText('Cash out')).toBeInTheDocument()
    for (const k of '1234') await user.click(screen.getByRole('button', { name: k }))
    await user.click(screen.getByRole('button', { name: 'Record' }))
    expect(await screen.findByText('Cash out recorded')).toBeInTheDocument()
    const acts = await operatorApi.activity('Agent 024')
    expect(acts.some((a) => a.text === 'You recorded: Cash out · SLE 3,000')).toBe(true)
    expect(acts.every((a) => !/077|555 321/.test(a.text))).toBe(true)
  })

  it('the Activity tab draws what the agent recorded, the commission and customers sent, and what customers said without who', async () => {
    const user = userEvent.setup()
    render(<App start="/agent/activity" />)
    await signIn(user)
    expect(await screen.findByRole('heading', { name: 'Activity' })).toBeInTheDocument()
    const legend = await screen.findByRole('list', { name: 'Legend' })
    expect(within(legend).getByText(/Transactions/)).toBeInTheDocument()
    expect(within(legend).getByText(/Commission/)).toBeInTheDocument()
    expect(within(legend).getByText(/People who found you/)).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Month' }))
    expect(await screen.findByRole('heading', { name: 'This month' })).toBeInTheDocument()
    expect((await screen.findAllByText(/^A customer/)).length).toBeGreaterThan(0)
  })
})

describe('the listing on the dashboard', () => {
  // Off screen in the new agent design's first pass (2026-11-01): this part is not in the design file yet. Restore with it.
  it.skip('greys the listing and shows the headline when the agent steps away, and comes back on Open', async () => {
    const user = userEvent.setup()
    render(<App />)
    await signIn(user)
    await screen.findAllByText("Fatmata's Shop")
    const card = () => screen.getByRole('article', { name: /your listing/i })
    expect(card()).toHaveAttribute('data-state', 'open')
    expect(within(card()).getByText('Cash out')).toBeInTheDocument()
    // The choices live on Shop status, one tap from the home's Open / Close tile.
    await user.click(screen.getByRole('link', { name: 'Open / Close' }))
    await user.click(await screen.findByRole('button', { name: 'Go Away' }))
    expect(await screen.findByText('Hidden from customers · tap to reopen')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'hidden'))
    expect(within(card()).getByText('Availability hidden')).toBeInTheDocument()
    expect(within(card()).queryByText('Cash out')).not.toBeInTheDocument()
    expect(screen.getByText(/Away · not sent customers/)).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Open / Close' }))
    await user.click(await screen.findByRole('button', { name: 'Open for Business' }))
    expect(await screen.findByText('You are visible to customers')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(card()).toHaveAttribute('data-state', 'open'))
  })

  // Off screen in the new agent design's first pass (2026-11-01): this part is not in the design file yet. Restore with it.
  it.skip('tells an agent who is not on the map yet, with the way to pin the shop', async () => {
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
    expect(link).toHaveAttribute('href', '/agent/history')
  })
})

describe('low on cash or float today', () => {
  // Off screen in the new agent design's first pass (2026-11-01): this part is not in the design file yet. Restore with it.
  it('Cash today and Float today lower one side for customers until midnight, and OK clears it', async () => {
    const user = userEvent.setup()
    render(<App start="/agent/status" />)
    await signIn(user)
    const cash = await screen.findByRole('radiogroup', { name: 'Cash today' })
    expect(within(cash).getByRole('radio', { name: 'OK' })).toHaveAttribute('aria-checked', 'true')
    await user.click(within(cash).getByRole('radio', { name: 'Low' }))
    await waitFor(() => expect(within(screen.getByRole('radiogroup', { name: 'Cash today' })).getByRole('radio', { name: 'Low' })).toHaveAttribute('aria-checked', 'true'))
    const home = await operatorApi.home('Agent 024')
    expect(home.low).toMatchObject({ cash_out: 'low', deposit: null })
    // Float is untouched: an empty drawer is exactly when the agent wants cash ins.
    expect(within(screen.getByRole('radiogroup', { name: 'Float today' })).getByRole('radio', { name: 'OK' })).toHaveAttribute('aria-checked', 'true')
    await waitFor(() => expect(within(screen.getByRole('radiogroup', { name: 'Float today' })).getByRole('radio', { name: 'None' })).toBeEnabled())
    await user.click(within(screen.getByRole('radiogroup', { name: 'Float today' })).getByRole('radio', { name: 'None' }))
    await waitFor(async () => expect((await operatorApi.home('Agent 024')).low.deposit).toBe('none'))
    // Never a figure or a balance on this screen.
    expect(document.body.textContent).not.toMatch(/\d+%|balance/i)
    await waitFor(() => expect(within(screen.getByRole('radiogroup', { name: 'Cash today' })).getByRole('radio', { name: 'OK' })).toBeEnabled())
    await user.click(within(screen.getByRole('radiogroup', { name: 'Cash today' })).getByRole('radio', { name: 'OK' }))
    await waitFor(() => expect(within(screen.getByRole('radiogroup', { name: 'Float today' })).getByRole('radio', { name: 'OK' })).toBeEnabled())
    await user.click(within(screen.getByRole('radiogroup', { name: 'Float today' })).getByRole('radio', { name: 'OK' }))
    await waitFor(async () => expect((await operatorApi.home('Agent 024')).low).toMatchObject({ cash_out: null, deposit: null }))
  })
})

describe('float request, when the list will not load', () => {
  it('hides the form, says why, and offers Try again', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(operatorApi, 'floatRequests').mockRejectedValue(new Error("You're offline. Check your data or Wi-Fi, then try again."))
    render(<App start="/agent/float" />)
    await signIn(user)
    expect(await screen.findByText(/couldn't load your float requests/i)).toBeInTheDocument()
    expect(screen.getByText(/the form is hidden to stop a double request/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit request/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^amount$/i)).not.toBeInTheDocument()
    // Back online: Try again brings the form.
    spy.mockRestore()
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByRole('button', { name: /submit request/i })).toBeInTheDocument()
  })
})
