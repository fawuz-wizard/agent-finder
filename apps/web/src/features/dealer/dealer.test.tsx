import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/design'
import { SessionProvider } from '@/features/auth/SessionProvider'
import { SESSION_KEY } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { PERMISSIONS } from '@/types/operator'
import DealerDashboardPage from './DashboardPage'
import SendFloatPage from './SendFloatPage'
import DealerNotificationsPage from './NotificationsPage'
import DealerAgentReportsPage from './AgentReportsPage'
import DealerAgentDetailPage from './AgentDetailPage'
import DealerFloatReviewPage from './FloatReviewPage'
import DealerAttentionPage from './AttentionPage'
import DealerAgentsPage from './AgentsPage'
import DealerFloatQueuePage from './FloatQueuePage'
import DealerProfilePage from './ProfilePage'
import DealerSettingsPage from './SettingsPage'
import DealerRecordsPage from './RecordsPage'
import DealerRevealsPage from './RevealsPage'
import DealerActionsPage from './ActionsPage'
import { pointer } from '@/test-utils/pointer'
import RegisterAgentPage from './RegisterAgentPage'

// jsdom has no canvas: the picture arrives already shrunk.
vi.mock('@/lib/photo', async (orig) => ({ ...(await orig<typeof import('@/lib/photo')>()), shrinkPhoto: vi.fn(async () => 'data:image/jpeg;base64,/9j/4AAQSkZJRg==') }))
import DealerSearchPage from './SearchPage'

const ALL = [PERMISSIONS.viewAgent, PERMISSIONS.viewFinancial, PERMISSIONS.manageFloat, PERMISSIONS.viewHistory, PERMISSIONS.contact, PERMISSIONS.escalate]

function signIn(permissions: string[]) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 't', role: 'dealer', name: 'Kissy Distribution', ref: 'Kissy Distribution', permissions }))
}

function App({ start }: { start: string }) {
  return (
    <ToastProvider>
      <SessionProvider>
        <MemoryRouter initialEntries={[start]}>
          <Routes>
            <Route path="/dealer" element={<DealerDashboardPage />} />
            <Route path="/dealer/float/send" element={<SendFloatPage />} />
            <Route path="/dealer/notifications" element={<DealerNotificationsPage />} />
            <Route path="/dealer/agents" element={<DealerAgentsPage />} />
            <Route path="/dealer/agents/new" element={<RegisterAgentPage />} />
            <Route path="/dealer/agents/:ref" element={<DealerAgentDetailPage />} />
            <Route path="/dealer/agents/:ref/reports" element={<DealerAgentReportsPage />} />
            <Route path="/dealer/search" element={<DealerSearchPage />} />
            <Route path="/dealer/float" element={<DealerFloatQueuePage />} />
            <Route path="/dealer/float/:id" element={<DealerFloatReviewPage />} />
            <Route path="/dealer/attention" element={<DealerAttentionPage />} />
            <Route path="/dealer/attention/:id" element={<DealerAttentionPage />} />
            <Route path="/dealer/profile" element={<DealerProfilePage />} />
            <Route path="/dealer/settings" element={<DealerSettingsPage />} />
            <Route path="/dealer/records" element={<DealerRecordsPage />} />
            <Route path="/dealer/reveals" element={<DealerRevealsPage />} />
            <Route path="/dealer/actions" element={<DealerActionsPage />} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </ToastProvider>
  )
}

beforeEach(() => sessionStorage.clear())

describe('dealer', () => {
  it('opens on the four counts, the quick actions and the bell, with no financial value on screen', async () => {
    signIn(ALL)
    const { container } = render(<App start="/dealer" />)
    expect(await screen.findByRole('link', { name: /^notifications/i })).toHaveAttribute('href', '/dealer/notifications')
    expect(screen.getByText('Active')).toBeInTheDocument()
    // The signals sit behind the Attention action, their count on it, not as a list on the home.
    expect(screen.getByRole('link', { name: /^attention, \d+ to look into$/i })).toHaveAttribute('href', '/dealer/attention')
    expect(screen.queryByText(/needs attention ·/i)).not.toBeInTheDocument()
    // Money never appears on the dashboard; only request amounts, which are the agent's own statement.
    expect(container.textContent).not.toMatch(/balance/i)
  })

  it('says how many agents have not signed in yet, instead of a signal for each', async () => {
    const real = await operatorApi.dealerOverview()
    const spy = vi.spyOn(operatorApi, 'dealerOverview').mockResolvedValue({ ...real, not_signed_in: 44, signals: [] })
    signIn(ALL)
    render(<App start="/dealer" />)
    expect(await screen.findByText(/44 agents have not signed in yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/status expired/i)).not.toBeInTheDocument()
    spy.mockRestore()
  })

  it('lists a pin waiting for confirmation under the bell, leading to the agent', async () => {
    signIn(ALL)
    const real = await operatorApi.dealerOverview()
    vi.spyOn(operatorApi, 'dealerOverview').mockResolvedValue({
      ...real,
      on_map: real.agent_count - 1,
      pins_waiting: [{ ref: 'Agent 024', name: "Fatmata's Shop", person_name: 'Fatmata Kamara', area: 'Lumley Beach Road, by the bank' }],
    })
    render(<App start="/dealer" />)
    expect(await screen.findByText(/4 of 5 on the map for customers/)).toBeInTheDocument()
    // Home no longer lists it; the bell does.
    expect(screen.queryByText(/pins waiting for your confirmation/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /notifications, \d+ new/i })).toHaveAttribute('href', '/dealer/notifications')
    vi.restoreAllMocks()
  })

  it('moves float requests and the forecast from Home to the bell, and counts what is unread', async () => {
    localStorage.removeItem('af.dealerSeenNotifications')
    signIn(ALL)
    const user = userEvent.setup()
    const real = await operatorApi.dealerOverview()
    const pins = [{ ref: 'Agent 024', name: "Fatmata's Shop", person_name: 'Fatmata Kamara', area: 'Lumley Beach Road' }]
    vi.spyOn(operatorApi, 'dealerOverview').mockResolvedValue({ ...real, pins_waiting: pins })
    render(<App start="/dealer" />)
    await screen.findByText(/network overview/i)
    expect(screen.queryByText(/float requests ·/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/float forecast/i)).not.toBeInTheDocument()
    const forecastNotices = real.forecast_counts.high + real.forecast_counts.medium > 0 ? 1 : 0
    const expected = real.float_requests.length + pins.length + forecastNotices
    const bell = screen.getByRole('link', { name: new RegExp(`notifications, ${expected} new`, 'i') })

    await user.click(bell)
    const requests = await screen.findByRole('region', { name: new RegExp(`float requests · ${real.float_requests.length} waiting`, 'i') })
    const first = real.float_requests[0]!
    expect(within(requests).getAllByRole('link', { name: /review/i })[0]).toHaveAttribute('href', `/dealer/float/${first.id}`)
    expect(screen.getByRole('region', { name: /pins to confirm/i })).toBeInTheDocument()
    if (forecastNotices) expect(within(screen.getByRole('region', { name: /float forecast/i })).getByRole('link', { name: /see who/i })).toHaveAttribute('href', '/dealer/float?tab=low')
    expect(screen.queryByText(/balance/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /mark all read/i }))
    expect(screen.queryByLabelText('New')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /mark all read/i })).not.toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('masks money by default, requires a purpose to reveal, and the reveal is recorded', async () => {
    signIn(ALL)
    const user = userEvent.setup()
    render(<App start="/dealer/agents/Agent%20024" />)
    // Money is folded away on the agent's page until the aggregator opens it.
    await user.click(await screen.findByRole('button', { name: /^money/i }))
    expect(screen.getAllByLabelText('hidden').length).toBe(2)
    expect(screen.queryByText(/SLE 12,400/)).not.toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /reveal/i })[0]!)
    const dialog = await screen.findByRole('dialog')
    const revealBtn = within(dialog).getByRole('button', { name: /^reveal$/i })
    expect(revealBtn).toBeDisabled() // no purpose, no reveal
    await user.type(within(dialog).getByPlaceholderText(/reviewing a float request/i), 'Reviewing float request')
    await user.click(revealBtn)

    expect(await screen.findByText(/SLE 12,400/)).toBeInTheDocument()
    expect(screen.getByText(/hides in \d+s/)).toBeInTheDocument()
    const audit = await operatorApi.audit()
    expect(audit[0]).toMatchObject({ agent_ref: 'Agent 024', field: 'balance', purpose: 'Reviewing float request' })
    expect(JSON.stringify(audit)).not.toContain('12400')
  })

  it('offers no reveal at all without the financial permission', async () => {
    signIn(ALL.filter((p) => p !== PERMISSIONS.viewFinancial))
    const user = userEvent.setup()
    render(<App start="/dealer/agents/Agent%20024" />)
    await user.click(await screen.findByRole('button', { name: /^money/i }))
    expect(screen.queryByRole('button', { name: /reveal/i })).not.toBeInTheDocument()
    expect(screen.getAllByText(/not available to you/i).length).toBe(2)
  })

  it('approves a float request and the agent sees it approved', async () => {
    signIn(ALL)
    const user = userEvent.setup()
    const created = await operatorApi.requestFloat('Agent 017', 3000, 'Weekend')
    render(<App start={`/dealer/float/${created.id}`} />)
    await screen.findByText(/amount requested/i)
    await user.click(screen.getByRole('button', { name: /^approve$/i }))
    expect(await screen.findByRole('heading', { name: /^Float$/ })).toBeInTheDocument()
    const agentView = (await operatorApi.floatRequests('Agent 017')).find((r) => r.id === created.id)
    expect(agentView?.state).toBe('approved')
    expect(agentView?.decided_by).toBe('Kissy Distribution')
  })

  it('puts nudge, call, snooze and resolve on every attention row', async () => {
    signIn(ALL)
    render(<App start="/dealer/attention" />)
    const row = await screen.findByRole('group', { name: /actions for agent 024/i })
    expect(within(row).getByRole('button', { name: /^nudge$/i })).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: /^call$/i })).toHaveAttribute('href', 'tel:+23276000024')
    expect(within(row).getByRole('button', { name: /^snooze$/i })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: /^resolve$/i })).toBeInTheDocument()
    // No number on file: Call is present but cannot be tapped.
    const amadu = screen.getByRole('group', { name: /actions for agent 038/i })
    expect(within(amadu).getByRole('button', { name: /^call$/i })).toBeDisabled()
  })

  it('snooze and resolve take the row off my queue, are logged, and never touch the agent', async () => {
    signIn(ALL)
    const user = userEvent.setup()
    const before = await operatorApi.dealerAgent('Agent 024')
    render(<App start="/dealer/attention" />)
    const row = await screen.findByRole('group', { name: /actions for agent 024/i })
    await user.click(within(row).getByRole('button', { name: /^snooze$/i }))
    expect(await screen.findByText(/snoozed "says available, customers say otherwise" for fatmata's shop until/i)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /actions for agent 024/i })).not.toBeInTheDocument()

    const stale = screen.getByRole('group', { name: /actions for agent 038/i })
    await user.click(within(stale).getByRole('button', { name: /^resolve$/i }))
    expect(await screen.findByText(/resolved "status not updated in 3 days" for amadu corner shop for today/i)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /actions for agent 038/i })).not.toBeInTheDocument()

    const logged = await operatorApi.actions(null)
    expect(logged.map((x) => x.action).slice(0, 2)).toEqual(['resolve', 'snooze'])
    const after = await operatorApi.dealerAgent('Agent 024')
    expect(after.declaration).toEqual(before.declaration)
    expect(after.open_signals).toBe(0)
    // The overview agrees: the queue no longer carries either signal.
    const over = await operatorApi.dealerOverview()
    expect(over.signals.map((s) => s.id)).not.toContain('sig-mismatch-Agent 024')
    expect(over.signals.map((s) => s.id)).not.toContain('sig-stale-Agent 038')
  })

  it('turns each dashboard tile into a filter on the agent list, and the counts agree', async () => {
    signIn(ALL)
    const user = userEvent.setup()
    render(<App start="/dealer" />)
    const closedTile = await screen.findByRole('link', { name: /^closed: \d+/i })
    expect(closedTile).toHaveAttribute('href', '/dealer/agents?filter=closed')
    const tileCount = Number(/closed: (\d+)/i.exec(closedTile.getAttribute('aria-label') ?? '')?.[1])
    expect(tileCount).toBeGreaterThan(0)
    await user.click(closedTile)

    // Only agents in that bucket: Salamatu is closed, Amadu is stale. The chip carries the tile's count.
    expect(await screen.findByText('Amadu Corner Shop')).toBeInTheDocument()
    expect(screen.getByText('Salamatu Shop')).toBeInTheDocument()
    expect(screen.queryByText("Fatmata's Shop")).not.toBeInTheDocument()
    expect(screen.getAllByText(/^\d{3} · /).length).toBe(tileCount)
    const chips = screen.getByRole('group', { name: /^show$/i })
    const closedChip = within(chips).getByRole('button', { name: /^closed/i })
    expect(closedChip).toHaveAttribute('aria-pressed', 'true')
    expect(closedChip).toHaveTextContent(`Closed (${tileCount})`)

    // The four chips: All, Active, Inactive, Not on map. The home's Closed filter shows as a fifth
    // chip until it is cleared.
    expect(within(chips).getAllByRole('button').map((b) => b.textContent?.replace(/ \(\d+\)/, ''))).toEqual(['Closed', 'All', 'Active', 'Inactive', 'Not on map'])
    await user.click(within(chips).getByRole('button', { name: /^inactive/i }))
    expect(await screen.findByText('Ibrahim Cash Point')).toBeInTheDocument()
    expect(screen.getByText('Salamatu Shop')).toBeInTheDocument()
    expect(screen.queryByText("Fatmata's Shop")).not.toBeInTheDocument()
    expect(within(chips).queryByRole('button', { name: /^closed/i })).not.toBeInTheDocument()
    await user.click(within(chips).getByRole('button', { name: /^active/i }))
    expect(await screen.findByText("Fatmata's Shop")).toBeInTheDocument()
    expect(screen.queryByText('Salamatu Shop')).not.toBeInTheDocument()
    await user.click(within(chips).getByRole('button', { name: /^not on map/i }))
    expect(await screen.findByText(/every active agent is on the map/i)).toBeInTheDocument()
    await user.click(within(chips).getByRole('button', { name: /^all/i }))
    expect(screen.getAllByText(/^\d{3} · /).length).toBe(5)
  })

  it('will not decline without a reason', async () => {
    signIn(ALL)
    const user = userEvent.setup()
    const created = await operatorApi.requestFloat('Agent 038', 1000, 'Low')
    render(<App start={`/dealer/float/${created.id}`} />)
    await screen.findByText(/amount requested/i)
    await user.click(screen.getByRole('button', { name: /^decline$/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /decline with this reason/i })).toBeDisabled()
    vi.restoreAllMocks()
  })
})

describe('float forecast', () => {
  it('shows who will probably run short, with reasons, and never a balance', async () => {
    signIn(ALL)
    const { container } = render(<App start="/dealer/float" />)
    // Both lists load; the queue may also show Agent 038 (a request from an earlier test).
    await screen.findByText(/^Waiting$/)
    await userEvent.setup().click(screen.getByRole('tab', { name: /^low today/i }))
    const section = await screen.findByRole('region', { name: /low or likely short · \d+/i })
    expect(await within(section).findByText('Amadu Corner Shop')).toBeInTheDocument()
    expect(within(section).getAllByText('Likely short by tomorrow').length).toBeGreaterThan(0)
    expect(within(section).getByText('Says no cash right now.')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/balance|SLE 12,400/i)
    // The forecast is a ranking: high before medium.
    const chips = screen.getAllByText(/likely short by tomorrow|watch this week/i).map((el) => el.textContent)
    const firstWatch = chips.indexOf('Watch this week')
    const lastShort = chips.lastIndexOf('Likely short by tomorrow')
    expect(firstWatch === -1 || lastShort < firstWatch).toBe(true)
  })

  it('puts the count under the bell, linking to the reasons', async () => {
    signIn(ALL)
    render(<App start="/dealer/notifications" />)
    const section = await screen.findByRole('region', { name: /float forecast/i })
    expect(within(section).getByText(/\d+ (likely short by tomorrow|to watch this week)/i)).toBeInTheDocument()
    expect(within(section).getByRole('link', { name: /see who/i })).toHaveAttribute('href', '/dealer/float?tab=low')
  })
})

describe('trust score', () => {
  it('shows each agent how often their word held up, on their page, and never as a customer-facing thing', async () => {
    signIn(ALL)
    render(<App start="/dealer/agents/Agent%20024" />)
    expect(await screen.findByText('Mixed')).toBeInTheDocument()
    expect(screen.getByText(/10 of 12 visits matched the status in the last 14 days\./)).toBeInTheDocument()
    // The list stays one state per row: the track record is on the agent's page.
    const rows = await operatorApi.dealerAgents()
    expect(rows.find((r) => r.ref === 'Agent 031')!.reliability.label_text).toBe('Reliable')
    expect(rows.find((r) => r.ref === 'Agent 038')!.reliability.label_text).toBe('No track record yet')
  })

  it('an unreliable word raises a high signal and flags the row, without touching the status', async () => {
    const { demoRecordVisit, demoDealerAgentDetail } = await import('@/services/operatorDemo')
    for (let n = 0; n < 3; n += 1) demoRecordVisit('Sento Enterprise', 'cash_out', 2000, 'no', 'could_not_complete')
    // 9 + 3 visits, 3 failed → 25% → mixed; three more make it unreliable.
    for (let n = 0; n < 3; n += 1) demoRecordVisit('Sento Enterprise', 'cash_out', 2000, 'no', 'less_than_requested')
    const detail = demoDealerAgentDetail('Agent 031')
    expect(detail.reliability.label).toBe('unreliable')
    expect(detail.reliability.text).toBe('9 of 15 visits matched the status in the last 14 days.')
    expect(detail.declaration.cash_out).toBe('some')
    const over = await operatorApi.dealerOverview()
    const sig = over.signals.find((s) => s.id === 'sig-trust-Agent 031')!
    expect(sig.title).toBe('Status keeps failing customers')
    expect(sig.sentence).toMatch(/6 of 15 customers/)
    const rows = await operatorApi.dealerAgents()
    expect(rows.find((r) => r.ref === 'Agent 031')!.attention).toBe(true)
  })
})

describe('evidence by amount', () => {
  it('the dealer\'s note sets what reads as likely, beats the word, and never reaches customers', async () => {
    signIn(ALL)
    const user = userEvent.setup()
    render(<App start="/dealer/agents/Agent%20024" />)
    await user.click(await screen.findByRole('button', { name: /^more details/i }))
    await screen.findByText(/usually handles/i)
    // The agent's own wording never reaches this page: the age, not "customers no longer see you".
    expect(screen.queryByText(/see you/i)).not.toBeInTheDocument()
    // The note sits behind an Edit row until the dealer asks for the form.
    expect(screen.queryByLabelText(/cash out, up to about/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^edit/i }))
    await user.type(screen.getByLabelText(/cash out, up to about/i), '5000')
    await user.click(screen.getByRole('button', { name: /save note/i }))
    expect(await screen.findByText(/your dealer noted you usually handle up to about SLE 5,000/i)).toBeInTheDocument()
    const { demoAgentHome } = await import('@/services/operatorDemo')
    const home = demoAgentHome('Agent 024')
    expect(home.customers_see.sides[0]!.range_text).toBe('up to SLE 5,000')
    expect(home.declaration.cash_out).toBe('most') // the word is untouched; the evidence decides
    await operatorApi.setUsual('Agent 024', { usual_max_sle: null, usual_float_max_sle: null, usual_daily_transactions: null })
  })
})

describe('registration', () => {
  it('lets a dealer with MANAGE_AGENT register any agent, who then appears in the register', async () => {
    // Offline, as on a phone with no signal: the area lookup gets no answer and the screen asks.
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))))
    const user = userEvent.setup()
    signIn([...ALL, PERMISSIONS.manageAgent])
    render(<App start="/dealer/agents" />)
    await user.click(await screen.findByRole('link', { name: /^register$/i }))
    await screen.findByRole('heading', { name: /register an agent/i })
    await user.type(screen.getByLabelText(/shop name/i), "Mariama's Corner")
    await user.type(screen.getByLabelText(/agent's name/i), 'Mariama Sesay')
    // One short screen: no hours, no usual amounts, no "customers may call", no number to pick.
    expect(screen.queryByLabelText(/cash out, up to about/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/opens/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/customers may call/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/agent number/i)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/landmark customers read/i), 'Opposite the venue gate')
    await user.click(screen.getByRole('button', { name: /type coordinates/i }))
    await user.type(screen.getByLabelText(/latitude/i), '8.4710')
    await user.type(screen.getByLabelText(/longitude/i), '-13.2600')
    // No map service in tests: the area cannot be looked up, so the screen asks for it.
    await user.type(await screen.findByLabelText(/^area$/i, {}, { timeout: 3000 }), 'Hill Station')
    await user.click(screen.getByLabelText(/checked this agent against orange/i))
    // The phone is required: no phone, no registration.
    expect(screen.getByRole('button', { name: /^register agent$/i })).toBeDisabled()
    await user.type(screen.getByLabelText(/^phone$/i), '+232 76 123 456')
    await user.click(screen.getByRole('button', { name: /^register agent$/i }))
    // Lands on the new agent's detail, under the number the platform assigned, with the
    // one-time code to read out: six digits, shown once, never a PIN the dealer chose.
    expect(await screen.findByText(/^1\d\d · /)).toBeInTheDocument()
    expect(screen.getAllByText(/Mariama's Corner/).length).toBeGreaterThan(0)
    const shown = screen.getByLabelText(/one-time code/i)
    const code = shown.textContent!.replace(/\s/g, '')
    expect(code).toMatch(/^\d{6}$/)
    expect(screen.getByText(/read it out in person/i)).toBeInTheDocument()
    // The register lists them now, and the registration was logged with the dealer's name.
    const rows = await operatorApi.dealerAgents()
    const mine = rows.find((r) => r.name === "Mariama's Corner")
    expect(mine).toBeDefined()
    expect(mine!.phone?.replace(/\s/g, '')).toBe('+23276123456')
    const acts = await operatorApi.actions(mine!.ref)
    expect(acts.some((a) => /registered Mariama's Corner/.test(a.note) && /Orange's record/.test(a.note))).toBe(true)
    // The agent signs in with the code, which opens only the Choose-PIN step; the PIN they
    // choose works from then on and the code is dead.
    await expect(operatorApi.signIn(mine!.ref, code, 'agent')).resolves.toMatchObject({ role: 'agent', ref: mine!.ref, must_set_pin: true })
    await expect(operatorApi.signIn(mine!.ref, '1234', 'agent')).rejects.toThrow(/PIN/)
    await expect(operatorApi.choosePin(mine!.ref, 'agent', code)).rejects.toThrow(/not the code/)
    await expect(operatorApi.choosePin(mine!.ref, 'agent', '2468')).resolves.toEqual({ pin_set: true })
    await expect(operatorApi.signIn(mine!.ref, '2468', 'agent')).resolves.toMatchObject({ must_set_pin: false })
    await expect(operatorApi.signIn(mine!.ref, code, 'agent')).rejects.toThrow(/PIN/)
    vi.unstubAllGlobals()
    // Forgotten: the dealer issues another code from the agent's page and never sets a PIN.
    await user.click(screen.getByRole('button', { name: /issue another code/i }))
    await waitFor(() => expect(screen.getByLabelText(/one-time code/i).textContent!.replace(/\s/g, '')).not.toBe(code))
    const fresh = screen.getByLabelText(/one-time code/i).textContent!.replace(/\s/g, '')
    await expect(operatorApi.signIn(mine!.ref, '2468', 'agent')).rejects.toThrow(/PIN/)
    await expect(operatorApi.signIn(mine!.ref, fresh, 'agent')).resolves.toMatchObject({ must_set_pin: true })
    const later = await operatorApi.actions(mine!.ref)
    expect(later.some((a) => /issued a new sign-in code/.test(a.note))).toBe(true)
  }, 15_000)

  it('offers no way to register without the permission: no link, and the page sends you back', async () => {
    signIn(ALL)
    render(<App start="/dealer/agents" />)
    await screen.findByLabelText('Find an agent')
    expect(screen.queryByRole('link', { name: /^register$/i })).not.toBeInTheDocument()
    render(<App start="/dealer/agents/new" />)
    expect(await screen.findAllByLabelText('Find an agent')).not.toHaveLength(0)
    expect(screen.queryByRole('heading', { name: /register an agent/i })).not.toBeInTheDocument()
  })

  it('refuses a location outside Sierra Leone with a message, not a crash', async () => {
    await expect(
      operatorApi.registerAgent({
        ref: null, person_name: 'A', shop_name: 'B', area: 'Lumley', street: 'C', lat: 48.85, lng: 2.35, phone: '+232 76 555 141', phone_visible: false,
        open_time: '07:00', close_time: '20:00', usual_max_sle: null, usual_float_max_sle: null, usual_daily_transactions: null, verified: false,
      }),
    ).rejects.toThrow(/outside Sierra Leone/)
  })
})

describe('search', () => {
  it('finds an agent by town, by number or by phone, opens them, and remembers the search', async () => {
    const user = userEvent.setup()
    signIn(ALL)
    localStorage.clear()
    render(<App start="/dealer/search" />)
    const box = await screen.findByLabelText('Search your agents')
    expect(screen.queryByText('Recent')).not.toBeInTheDocument()
    await user.type(box, 'Aberdeen')
    expect(await screen.findByText('Sento Enterprise')).toBeInTheDocument()
    expect(screen.queryByText("Fatmata's Shop")).not.toBeInTheDocument()
    expect(screen.getByText('1 agent')).toBeInTheDocument()
    await user.clear(box)
    await user.type(box, '024')
    expect(await screen.findByText("Fatmata's Shop")).toBeInTheDocument()
    await user.clear(box)
    await user.type(box, '076 000 009')
    expect(await screen.findByText('Ibrahim Cash Point')).toBeInTheDocument()
    await user.clear(box)
    await user.type(box, 'nobody here')
    expect(await screen.findByText(/no agent of yours matches/i)).toBeInTheDocument()
    // Opening a result remembers the query; it comes back as a pill under the box.
    await user.clear(box)
    await user.type(box, 'Sento')
    await user.click(await screen.findByText('Sento Enterprise'))
    expect(await screen.findByText(/^031 · /)).toBeInTheDocument()
    render(<App start="/dealer/search" />)
    expect((await screen.findAllByRole('button', { name: 'Sento' })).length).toBeGreaterThan(0)
  })
})

describe('agents from Orange\'s file', () => {
  it('an unlocated agent shows why customers cannot find them, and the dealer pins the shop', async () => {
    const user = userEvent.setup()
    signIn([...ALL, PERMISSIONS.manageAgent])
    const real = await operatorApi.dealerAgent('Agent 024')
    vi.spyOn(operatorApi, 'dealerAgent').mockResolvedValue({ ...real, located: false, source: 'orange_file', agent_code: '100001' })
    const edit = vi.spyOn(operatorApi, 'editAgent').mockResolvedValue({ ...(await operatorApi.editAgent('Agent 024', {})), located: true })
    render(<App start="/dealer/agents/Agent%20024" />)
    expect(await screen.findByText(/Not on the map yet/)).toBeInTheDocument()
    // The map is the first way; the fields are behind a pill for anyone who has the numbers.
    expect(screen.getByRole('img', { name: /drag the map to place the pin/i })).toBeInTheDocument()
    expect(screen.queryByLabelText('Latitude')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /type coordinates/i }))
    await user.type(screen.getByLabelText('Latitude'), '8.4710')
    await user.type(screen.getByLabelText('Longitude'), '-13.2600')
    await user.click(screen.getByRole('button', { name: /pin this shop/i }))
    expect(edit).toHaveBeenCalledWith('Agent 024', { lat: 8.471, lng: -13.26 })
    vi.restoreAllMocks()
  })

  it('an agent inactive at Orange is explained, not pinned', async () => {
    signIn([...ALL, PERMISSIONS.manageAgent])
    const real = await operatorApi.dealerAgent('Agent 024')
    vi.spyOn(operatorApi, 'dealerAgent').mockResolvedValue({ ...real, active: false })
    render(<App start="/dealer/agents/Agent%20024" />)
    expect(await screen.findByText(/marked inactive at Orange/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pin this shop/i })).not.toBeInTheDocument()
    vi.restoreAllMocks()
  })
})

describe('tabs', () => {
  it('the foot is Home, Float, Agents, Network; search lives on the Agents tab', async () => {
    const { DealerTabBar } = await import('./components/DealerTabBar')
    signIn(ALL)
    render(
      <MemoryRouter initialEntries={['/dealer']}>
        <DealerTabBar />
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation', { name: /aggregator sections/i })
    expect(within(nav).getAllByRole('link')).toHaveLength(4)
    for (const name of ['Home', 'Float', 'Agents', 'Network']) expect(within(nav).getByRole('link', { name })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Float' })).toHaveAttribute('href', '/dealer/float')
    expect(within(nav).getByRole('link', { name: 'Network' })).toHaveAttribute('href', '/dealer/network')
  })
})

describe('report and records', () => {
  it('the aggregator changes their own PIN from Settings, the current one first', async () => {
    const user = userEvent.setup()
    signIn(ALL)
    render(<App start="/dealer/settings" />)
    await user.click(await screen.findByRole('button', { name: /^change pin$/i }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Current PIN'), '9999')
    await user.type(within(dialog).getByLabelText('New PIN'), '5566')
    await user.type(within(dialog).getByLabelText('New PIN again'), '5566')
    await user.click(within(dialog).getByRole('button', { name: /^change pin$/i }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/not correct/i)
    await user.clear(within(dialog).getByLabelText('Current PIN'))
    await user.type(within(dialog).getByLabelText('Current PIN'), '1234')
    await user.click(within(dialog).getByRole('button', { name: /^change pin$/i }))
    expect(await screen.findByText(/your pin is changed/i)).toBeInTheDocument()
    await expect(operatorApi.signIn('kissy', '1234', 'dealer')).rejects.toThrow(/PIN/)
    await expect(operatorApi.signIn('kissy', '5566', 'dealer')).resolves.toMatchObject({ role: 'dealer' })
    await operatorApi.changeDealerPin('5566', '1234')
  })

  it('the profile is who you are: the name, the sign-in name and the region; Settings is one row', async () => {
    const user = userEvent.setup()
    signIn(ALL)
    render(<App start="/dealer/profile" />)
    // Who is signed in: the name, the sign-in name, the region. No number, no network figures.
    expect(await screen.findByText('kissy')).toBeInTheDocument()
    expect(screen.getByText('Aggregator · West')).toBeInTheDocument()
    expect(screen.queryByText('+232 •• ••• 123')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Organization details' })).not.toBeInTheDocument()
    expect(screen.queryByText('Signed in to the app')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage agents' })).toHaveAttribute('href', '/dealer/agents')
    // The reveal log and the permission list are not identity; the report is one door at the foot.
    expect(screen.getByRole('link', { name: 'Download a report' })).toHaveAttribute('href', '/dealer/records')
    expect(screen.queryByText(/financial reveals/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/decide float requests/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Settings' }))
    expect(await screen.findByRole('radiogroup', { name: 'Appearance' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My financial reveals' })).toHaveAttribute('href', '/dealer/reveals')
    expect(screen.getByRole('link', { name: 'My action history' })).toHaveAttribute('href', '/dealer/actions')
    // No permission list and no Sign out: Sign out lives on Profile only.
    expect(screen.queryByText(/what this account can do/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Decide float requests')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })

  it('a bell kind switched off in Settings leaves the bell on this phone, and comes back when switched on', async () => {
    const user = userEvent.setup()
    signIn(ALL)
    localStorage.removeItem('af.dealerBellOff')
    const { unmount } = render(<App start="/dealer/settings" />)
    const requests = await screen.findByRole('switch', { name: 'Float requests' })
    expect(requests).toBeChecked()
    await user.click(requests)
    expect(requests).not.toBeChecked()
    unmount()
    const first = render(<App start="/dealer/notifications" />)
    await screen.findByRole('heading', { name: /notifications/i })
    await waitFor(() => expect(screen.queryByRole('link', { name: /SLE/ })).not.toBeInTheDocument())
    expect(screen.queryByText(/waiting for you|float requests/i)).not.toBeInTheDocument()
    first.unmount()
    localStorage.removeItem('af.dealerBellOff')
    render(<App start="/dealer/notifications" />)
    expect((await screen.findAllByText(/SLE/)).length).toBeGreaterThan(0)
  })

  it('my action history lists what this aggregator did, never what the agents sent themselves', async () => {
    signIn(ALL)
    const ref = (await operatorApi.dealerAgents())[0]!.ref
    await operatorApi.act(ref, 'nudge', 'Kissy Distribution')
    render(<App start="/dealer/actions" />)
    const list = await screen.findByRole('list', { name: 'My actions' })
    expect(within(list).getAllByText(/asked .* to update their status/i).length).toBeGreaterThan(0)
    const notes = (await operatorApi.actions(null)).filter((a) => a.action === 'agent_note').map((a) => a.note)
    for (const n of notes) expect(within(list).queryByText(n)).not.toBeInTheDocument()
  })

  it('the aggregator adds their own picture from Profile; it shows on Profile and Home, and can be removed', async () => {
    const user = userEvent.setup()
    signIn(ALL)
    const first = render(<App start="/dealer/profile" />)
    await user.click(await screen.findByRole('button', { name: 'Add your picture' }))
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByRole('button', { name: /take photo/i })).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: /remove picture/i })).not.toBeInTheDocument()
    await user.upload(screen.getByTestId('dealer-photo-gallery'), new File(['x'], 'logo.jpg', { type: 'image/jpeg' }))
    const changed = await screen.findByRole('button', { name: 'Change your picture' })
    expect(changed.querySelector('img')).toHaveAttribute('src', expect.stringMatching(/^data:image\/jpeg/))
    first.unmount()
    const home = render(<App start="/dealer" />)
    await waitFor(() => expect(screen.getByRole('link', { name: 'Profile' }).querySelector('img')).not.toBeNull())
    home.unmount()
    render(<App start="/dealer/profile" />)
    await user.click(await screen.findByRole('button', { name: 'Change your picture' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /remove picture/i }))
    expect(await screen.findByRole('button', { name: 'Add your picture' })).toBeInTheDocument()
  })

  it('the aggregator ticks what to download: one table is a CSV, several are a zip, and the period travels with the call', async () => {
    const user = userEvent.setup()
    signIn(ALL)
    const csv = vi.spyOn(operatorApi, 'recordsCsv')
    const blobs: Blob[] = []
    vi.stubGlobal('URL', { ...URL, createObjectURL: (b: Blob) => (blobs.push(b), 'blob:x'), revokeObjectURL: () => undefined })
    render(<App start="/dealer/records" />)
    // Agents is ticked by default; it is a snapshot, so the period is off until a dated table joins.
    expect(await screen.findByText('1 table · CSV')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '7 days' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Download' }))
    expect(await screen.findByText(/saved as agent-report-/i)).toBeInTheDocument()
    expect(csv).toHaveBeenLastCalledWith('report', undefined)
    expect(blobs[0]!.type).toMatch(/text\/csv/)
    // Two more tables and a period: one zip, each table asked for from that date.
    await user.click(screen.getByLabelText(/customer reports/i))
    await user.click(screen.getByLabelText(/your actions/i))
    await user.click(screen.getByRole('radio', { name: 'Today' }))
    expect(screen.getByText('3 tables · today · zip of CSVs')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Download' }))
    expect(await screen.findByText(/saved as agent-finder-report-.*\.zip/i)).toBeInTheDocument()
    const today = new Date().toISOString().slice(0, 10)
    expect(csv).toHaveBeenCalledWith('reports', today)
    expect(csv).toHaveBeenCalledWith('actions', today)
    expect(blobs[1]!.type).toBe('application/zip')
    // jsdom's Blob cannot be read back; the writer itself is checked: a zip starts with PK and ends with the end-of-directory mark.
    const { zip } = await import('@/lib/zip')
    const bytes = zip([{ name: 'a.csv', text: 'x,y\n1,2\n' }, { name: 'b.csv', text: 'z\n' }])
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe('PK')
    expect(bytes[bytes.length - 22]).toBe(0x50)
    expect(bytes[bytes.length - 21]).toBe(0x4b)
    expect(bytes[bytes.length - 20]).toBe(0x05)
    expect(bytes[bytes.length - 19]).toBe(0x06)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('the agent report CSV carries status and location of my agents, never money', async () => {
    const text = await operatorApi.recordsCsv('report')
    expect(text.split('\n')[0]).toMatch(/^agent_ref,agent_code,shop_name,region/)
    expect(text).not.toMatch(/12,400|12400|balance/)
  })

  it("takes down the picture on an agent's page, and says so in the log", async () => {
    const user = userEvent.setup()
    signIn([...ALL, PERMISSIONS.manageAgent])
    const real = await operatorApi.dealerAgent('Agent 024')
    vi.spyOn(operatorApi, 'dealerAgent').mockResolvedValue({ ...real, photo: 'data:image/jpeg;base64,/9j/4AAQ' })
    const remove = vi.spyOn(operatorApi, 'removeAgentPhoto')
    render(<App start="/dealer/agents/Agent%20024" />)
    await user.click(await screen.findByRole('button', { name: /^more details/i }))
    expect(await screen.findByRole('img', { name: "Fatmata's Shop, photographed by the agent" })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /remove photo/i }))
    expect(remove).toHaveBeenCalledWith('Agent 024')
    vi.restoreAllMocks()
  })

  it('a pin the agent made waits for the aggregator to confirm, then customers are sent there', async () => {
    const user = userEvent.setup()
    signIn([...ALL, PERMISSIONS.manageAgent])
    const real = await operatorApi.dealerAgent('Agent 024')
    vi.spyOn(operatorApi, 'dealerAgent').mockResolvedValue({ ...real, located: true, location_confirmed: false, location_source: 'agent' })
    const confirm = vi.spyOn(operatorApi, 'confirmLocation')
    render(<App start="/dealer/agents/Agent%20024" />)
    expect(await screen.findByText(/Pin waiting for your confirmation/)).toBeInTheDocument()
    // The pin is on a map; Move it lets the aggregator drag the map under it and confirm the corrected point.
    expect(screen.getByRole('img', { name: /pinned by the agent/i })).toBeInTheDocument()
    const edit = vi.spyOn(operatorApi, 'editAgent')
    await user.click(screen.getByRole('button', { name: /move it/i }))
    const map = screen.getByRole('img', { name: /pinned by the agent/i })
    pointer(map, 'pointerdown', 10, 10)
    pointer(map, 'pointermove', 10, 60)
    pointer(map, 'pointerup', 10, 60)
    await user.click(screen.getByRole('button', { name: /confirm here/i }))
    // The corrected point is saved first, then the confirmation; both are awaited.
    await waitFor(() => expect(confirm).toHaveBeenCalledWith('Agent 024'))
    expect(edit).toHaveBeenCalledWith('Agent 024', expect.objectContaining({ lat: expect.any(Number), lng: expect.any(Number) }))
    vi.restoreAllMocks()
  })
})

describe('network', () => {
  it("shows the aggregator's own agents, not Orange's national view", async () => {
    const { default: DealerNetworkPage } = await import('./NetworkPage')
    signIn(ALL)
    render(
      <MemoryRouter initialEntries={['/dealer/network']}>
        <DealerNetworkPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Active rate')).toBeInTheDocument()
    expect(screen.getByText('Customer map')).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: /of your shops on the map/ })).toBeInTheDocument()
    // Kissy's own shops only: the demo's other regions belong to other aggregators.
    const { demoMapSummary } = await import('@/services/demoNationalMap')
    const scoped = await demoMapSummary()
    expect(scoped.scope).toBe('aggregator')
    expect(within(screen.getByText('Total').parentElement!).getByText(String(scoped.totals.registered))).toBeInTheDocument()
    // The full map is the aggregator's own, inside the app; Orange's national map is another account's screen.
    expect(screen.getByRole('link', { name: /open full map/i })).toHaveAttribute('href', '/dealer/network/map')
    expect([...document.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/dealer/map')).toBe(false)
    expect(document.body.textContent).not.toMatch(/SLE/)
  })
})

describe('full map', () => {
  it("filters the aggregator's shops by today's state and opens a shop's card with Call, never a balance", async () => {
    const { default: DealerFullMapPage } = await import('./FullMapPage')
    const user = userEvent.setup()
    signIn(ALL)
    render(
      <MemoryRouter initialEntries={['/dealer/network/map']}>
        <DealerFullMapPage />
      </MemoryRouter>,
    )
    const heading = await screen.findByRole('heading', { name: /all agents/i })
    await waitFor(() => expect(heading).toHaveTextContent(/\d+ shown/))
    const total = Number(/(\d+) shown/.exec(heading.textContent ?? '')![1])
    expect(total).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: /^away or closed/i }))
    const away = Number(/(\d+) shown/.exec(heading.textContent ?? '')![1])
    expect(away).toBeLessThan(total)
    await user.click(screen.getByRole('button', { name: /^all$/i }))
    await user.click(screen.getByRole('button', { name: /^Fatmata's Shop/ }))
    const card = screen.getByRole('region', { name: "Fatmata's Shop" })
    expect(within(card).getByRole('link', { name: 'Call agent' })).toHaveAttribute('href', expect.stringMatching(/^tel:/))
    expect(within(card).getByRole('link', { name: 'Agent details' })).toHaveAttribute('href', '/dealer/agents/Agent%20024')
    expect(document.body.textContent).not.toMatch(/SLE|balance/i)
  })
})

describe('send float', () => {
  it('records float sent in Orange Money for an agent found by number, and lists it in History', async () => {
    const user = userEvent.setup()
    signIn(ALL)
    render(<App start="/dealer/float" />)
    await user.click(await screen.findByRole('link', { name: /send float/i }))
    await user.type(await screen.findByLabelText(/agent number/i), '76000031')
    expect(await screen.findByText(/Sento Enterprise · Code 031 · your agent/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '10,000' }))
    await user.type(screen.getByLabelText(/orange money reference/i), 'MP2910.1432')
    await user.click(screen.getByRole('button', { name: 'Record SLE 10,000 sent' }))
    expect(await screen.findByText('Float recorded')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(await screen.findByText('Sent to Sento Enterprise')).toBeInTheDocument()
    expect(screen.getAllByText(/ref MP2910.1432/).length).toBeGreaterThan(0)
  })

  it('refuses a number that is not one of your agents', async () => {
    const user = userEvent.setup()
    signIn(ALL)
    render(<App start="/dealer/float/send" />)
    await user.type(await screen.findByLabelText(/agent number/i), '99999999')
    expect(await screen.findByText(/not one of your agents/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^record/i })).toBeDisabled()
  })

  it('Approve & send fills the form from the request and completes it', async () => {
    const user = userEvent.setup()
    signIn(ALL)
    const pending = (await operatorApi.floatRequests(null)).find((r) => r.state === 'pending')!
    render(<App start={`/dealer/float/send?request=${pending.id}`} />)
    expect(await screen.findByText(new RegExp(`${pending.agent_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · Code`))).toBeInTheDocument()
    const amount = pending.amount_sle.toLocaleString('en-US')
    expect(screen.getByLabelText(/amount \(sle\)/i)).toHaveValue(amount)
    await user.click(screen.getByRole('button', { name: `Record SLE ${amount} sent` }))
    expect(await screen.findByText('Float recorded')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    const after = (await operatorApi.floatRequests(null)).find((r) => r.id === pending.id)!
    expect(after.state).toBe('completed')
  })
})

describe("the agent's page, one screen first", () => {
  it('shows the same state as the list, what needs the aggregator, and today in three numbers', async () => {
    signIn(ALL)
    const rows = await operatorApi.dealerAgents()
    const row = rows.find((r) => r.ref === 'Agent 024')!
    render(<App start="/dealer/agents/Agent%20024" />)
    await screen.findByRole('heading', { name: "Fatmata's Shop" })
    const { agentState } = await import('./components/agentState')
    const state = agentState(row)
    expect(screen.getByText(new RegExp(`^${state.text} · `))).toBeInTheDocument()
    const needs = screen.getByRole('region', { name: /needs you/i })
    expect(within(needs).getByRole('link', { name: /float request sle 5,000/i })).toHaveAttribute('href', expect.stringMatching(/^\/dealer\/float\//))
    const today = screen.getByRole('region', { name: /^today$/i })
    expect(within(today).getByText('Transactions')).toBeInTheDocument()
    expect(within(today).getByText('Found them')).toBeInTheDocument()
    // The details are folded until asked for: no money row, no sign-in code on first view.
    expect(screen.queryByText(/float position/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^orange record/i })).toHaveAttribute('aria-expanded', 'false')
    expect(document.body.textContent).not.toMatch(/balance/i)
  })

  it('keeps the rare actions in the ••• menu, and escalating is recorded', async () => {
    signIn([...ALL, PERMISSIONS.manageAgent])
    const user = userEvent.setup()
    const act = vi.spyOn(operatorApi, 'act')
    render(<App start="/dealer/agents/Agent%20024" />)
    await user.click(await screen.findByRole('button', { name: /more actions/i }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: /action history/i })).toBeInTheDocument()
    await user.click(within(menu).getByRole('menuitem', { name: /issue a new sign-in code/i }))
    expect(screen.getByRole('button', { name: /^more details/i })).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: /more actions/i }))
    await user.click(screen.getByRole('menuitem', { name: /escalate to orange/i }))
    expect(act).toHaveBeenCalledWith('Agent 024', 'escalate', expect.any(String))
    vi.restoreAllMocks()
  })
})

describe("an agent's customer reports, for the aggregator", () => {
  it('opens from "not served today" on the agent page, not the Attention list of everyone', async () => {
    signIn(ALL)
    render(<App start="/dealer/agents/Agent%20024" />)
    const needs = await screen.findByRole('region', { name: /needs you/i })
    expect(within(needs).getByRole('link', { name: /not served today/i })).toHaveAttribute('href', '/dealer/agents/Agent%20024/reports')
    expect(screen.getByRole('link', { name: /customer reports/i })).toHaveAttribute('href', '/dealer/agents/Agent%20024/reports')
  })

  it('shows three tabs with their counts, the rating on top, 20 at a time, and Call at the bottom', async () => {
    signIn(ALL)
    const user = userEvent.setup()
    const real = await operatorApi.dealerAgentReports('Agent 024')
    const failed = Array.from({ length: 23 }, (_, k) => ({ id: `fb-n-${k}`, day_text: 'Today', kind: 'not_served' as const, reason_code: k < 14 ? 'could_not_complete' : 'closed', transaction_label: 'Cash out', reason_text: k < 14 ? 'Could not complete the transaction' : 'Was closed', rating: null, comment: k === 0 ? 'No cash again.' : null }))
    const words = [failed[0]!, { id: 'fb-c-1', day_text: 'Yesterday', kind: 'comment' as const, reason_code: null, transaction_label: 'Cash out', reason_text: null, rating: 5, comment: 'Quick service.' }]
    vi.spyOn(operatorApi, 'dealerAgentReports').mockImplementation(async (_ref, q = {}) => {
      const all = q.kind === 'comment' ? words : q.kind === 'not_served' ? failed.filter((i) => !q.reason || i.reason_code === q.reason) : [...failed, words[1]!]
      const offset = q.offset ?? 0
      return {
        ...real,
        summary: { served: 41, not_served: 23, comments: 2, ratings: 18, rating_average: 3.1 },
        reasons: [
          { code: 'could_not_complete', text: 'Could not complete the transaction', count: 14 },
          { code: 'closed', text: 'Was closed', count: 9 },
        ],
        trend: { this_week: 12, last_week: 5 },
        items: all.slice(offset, offset + 20),
        total: all.length,
      }
    })
    render(<App start="/dealer/agents/Agent%20024/reports" />)
    expect(await screen.findByLabelText('Rating 3.1 from 18 ratings')).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((x) => x.textContent)).toEqual(['23Not served', '2Comments', '41Served'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('12 this week, 5 last week')
    const list = screen.getByRole('list', { name: /not served visits/i })
    expect(within(list).getAllByText(/^Today · Cash out$/).length).toBe(20)
    await user.click(within(list).getByRole('button', { name: /load 3 more · 3 left/i }))
    expect(await within(list).findAllByText(/^Today · Cash out$/)).toHaveLength(23)
    // A reason chip narrows the list.
    await user.click(screen.getByRole('button', { name: 'Was closed 9' }))
    await waitFor(() => expect(within(screen.getByRole('list', { name: /not served visits/i })).getAllByText('Was closed').length).toBe(9))
    // Comments: every customer's words; a failed visit's words carry its reason.
    await user.click(screen.getByRole('tab', { name: /comments/i }))
    const said = await screen.findByRole('list', { name: 'Comments' })
    expect(within(said).getByText('“Quick service.”')).toBeInTheDocument()
    expect(within(said).getByText('Not served · Could not complete the transaction')).toBeInTheDocument()
    // Served: figures only, no list.
    await user.click(screen.getAllByRole('tab')[2]!)
    const panel = await screen.findByRole('tabpanel', { name: 'Served' })
    expect(within(panel).getByText('41')).toBeInTheDocument()
    expect(within(panel).getByText(/Served, of all reports \(41 of 64\)/)).toBeInTheDocument()
    expect(within(panel).queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^call /i }) ?? screen.queryByRole('button', { name: /^contact /i })).toBeInTheDocument()
    vi.restoreAllMocks()
  })
})

describe('back buttons', () => {
  it('Network → full map → Back → Back lands on Home, never a loop between the two', async () => {
    const { default: DealerNetworkPage } = await import('./NetworkPage')
    const { default: DealerFullMapPage } = await import('./FullMapPage')
    const user = userEvent.setup()
    signIn(ALL)
    render(
      <MemoryRouter initialEntries={['/dealer', '/dealer/network']} initialIndex={1}>
        <Routes>
          <Route path="/dealer" element={<p>Home screen</p>} />
          <Route path="/dealer/network" element={<DealerNetworkPage />} />
          <Route path="/dealer/network/map" element={<DealerFullMapPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('link', { name: /open full map/i }))
    await screen.findByRole('heading', { name: /all agents/i })
    await user.click(screen.getAllByRole('button', { name: /^back$/i })[0]!)
    expect(await screen.findByRole('heading', { name: /network overview/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^back$/i }))
    expect(await screen.findByText('Home screen')).toBeInTheDocument()
  })

  it('a screen opened straight from a link goes back to its parent instead of leaving the app', async () => {
    const { default: DealerFullMapPage } = await import('./FullMapPage')
    const user = userEvent.setup()
    signIn(ALL)
    render(
      <MemoryRouter initialEntries={['/dealer/network/map']}>
        <Routes>
          <Route path="/dealer/network" element={<p>Network screen</p>} />
          <Route path="/dealer/network/map" element={<DealerFullMapPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: /all agents/i })
    await user.click(screen.getAllByRole('button', { name: /^back$/i })[0]!)
    expect(await screen.findByText('Network screen')).toBeInTheDocument()
  })
})

describe('directions to an agent', () => {
  it('the agent page has three equal buttons, Directions leading to the map focused on the shop', async () => {
    signIn(ALL)
    render(<App start="/dealer/agents/Agent%20024" />)
    await screen.findByRole('heading', { name: "Fatmata's Shop" })
    const directions = screen.getByRole('link', { name: /^directions$/i })
    expect(directions).toHaveAttribute('href', '/dealer/network/map?focus=Agent%20024&route=1')
    expect(screen.getByRole('button', { name: /^nudge$/i })).toBeInTheDocument()
  })

  it('shows the way from where the aggregator is, Drive or Walk, and hands over to Maps', async () => {
    const { default: DealerFullMapPage } = await import('./FullMapPage')
    const user = userEvent.setup()
    signIn(ALL)
    const geo = { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 8.4465, longitude: -13.272 } } as GeolocationPosition) }
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true })
    render(
      <MemoryRouter initialEntries={['/dealer/network/map?focus=Agent%20024&route=1']}>
        <DealerFullMapPage />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: "Directions to Fatmata's Shop" })).toBeInTheDocument()
    // No map key in tests: TomTom gives no route, so the screen says the straight-line distance.
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/from you in a straight line/))
    const card = screen.getByRole('region', { name: "Fatmata's Shop" })
    const maps = within(card).getByRole('link', { name: /open in maps/i })
    expect(maps.getAttribute('href')).toContain('travelmode=driving')
    await user.click(screen.getByRole('button', { name: 'Walk' }))
    expect(within(card).getByRole('link', { name: /open in maps/i }).getAttribute('href')).toContain('travelmode=walking')
    // The card says the same state as the list.
    const { agentState } = await import('./components/agentState')
    const row = (await operatorApi.dealerAgents()).find((r) => r.ref === 'Agent 024')!
    expect(within(card).getByText(agentState(row).text)).toBeInTheDocument()
    Reflect.deleteProperty(navigator, 'geolocation')
  })
})

describe('dealer agents, when the list will not load', () => {
  it('says it could not load the agents, never an empty list, and Try again reloads', async () => {
    signIn(ALL)
    const user = userEvent.setup()
    const spy = vi.spyOn(operatorApi, 'dealerAgents').mockRejectedValue(new Error('Something went wrong.'))
    render(<App start="/dealer/agents" />)
    expect(await screen.findByText(/couldn't load your agents/i)).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: /try again/i })
    expect(screen.queryByText(/no agent matches/i)).not.toBeInTheDocument()
    spy.mockRestore()
    await user.click(retry)
    await waitFor(() => expect(screen.queryByText(/couldn't load your agents/i)).not.toBeInTheDocument())
    expect(await screen.findAllByRole('link', { name: /./ })).not.toHaveLength(0)
  })
})

describe('register an agent', () => {
  it('shows the agent number before Register and keeps the most accurate location reading', async () => {
    signIn([...ALL, PERMISSIONS.manageAgent])
    const clearWatch = vi.fn()
    // The network gives a rough fix first (400 m), then the GPS locks on (12 m).
    const watchPosition = vi.fn((ok: PositionCallback) => {
      const at = (lat: number, accuracy: number) => ({ coords: { latitude: lat, longitude: -13.26, accuracy } }) as GeolocationPosition
      ok(at(8.4, 400))
      ok(at(8.4655, 12))
      ok(at(8.41, 300)) // a worse reading after the good one is ignored
      return 7
    })
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition, clearWatch, getCurrentPosition: vi.fn() } })
    render(<App start="/dealer/agents/new" />)
    const number = await screen.findByText(/^Agent \d{3}$/)
    const register = screen.getByRole('button', { name: /register agent/i })
    expect(number.compareDocumentPosition(register) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /use my location/i }))
    expect(await screen.findByText(/accurate to about 12 m/i)).toBeInTheDocument()
    expect(clearWatch).toHaveBeenCalledWith(7)
  })
})
