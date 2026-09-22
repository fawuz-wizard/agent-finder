import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/design'
import { SessionProvider } from '@/features/auth/SessionProvider'
import { SESSION_KEY } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { PERMISSIONS } from '@/types/operator'
import DealerDashboardPage from './DashboardPage'
import DealerAgentDetailPage from './AgentDetailPage'
import DealerFloatReviewPage from './FloatReviewPage'
import DealerAttentionPage from './AttentionPage'
import DealerAgentsPage from './AgentsPage'
import DealerFloatQueuePage from './FloatQueuePage'

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
            <Route path="/dealer/agents" element={<DealerAgentsPage />} />
            <Route path="/dealer/agents/:ref" element={<DealerAgentDetailPage />} />
            <Route path="/dealer/float" element={<DealerFloatQueuePage />} />
            <Route path="/dealer/float/:id" element={<DealerFloatReviewPage />} />
            <Route path="/dealer/attention" element={<DealerAttentionPage />} />
            <Route path="/dealer/attention/:id" element={<DealerAttentionPage />} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </ToastProvider>
  )
}

beforeEach(() => sessionStorage.clear())

describe('dealer', () => {
  it('opens on the four counts and the things to act on, with no financial value on screen', async () => {
    signIn(ALL)
    const { container } = render(<App start="/dealer" />)
    expect(await screen.findByText(/float requests · \d+ waiting/i)).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText(/needs attention · \d+/i)).toBeInTheDocument()
    // Money never appears on the dashboard; only request amounts, which are the agent's own statement.
    expect(container.textContent).not.toMatch(/balance/i)
  })

  it('masks money by default, requires a purpose to reveal, and the reveal is recorded', async () => {
    signIn(ALL)
    const user = userEvent.setup()
    render(<App start="/dealer/agents/Agent%20024" />)
    await screen.findByText(/float & balance/i)
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
    render(<App start="/dealer/agents/Agent%20024" />)
    await screen.findByText(/float & balance/i)
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
    expect(await screen.findByText(/^Float requests$/)).toBeInTheDocument()
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
    expect(await screen.findByText(/Agent 038 · Amadu Corner Shop/)).toBeInTheDocument()
    expect(screen.getByText(/Agent 017 · Salamatu Shop/)).toBeInTheDocument()
    expect(screen.queryByText(/Agent 024 · Fatmata's Shop/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/Agent \d{3} · /).length).toBe(tileCount)
    const chips = screen.getByRole('group', { name: /^show$/i })
    const closedChip = within(chips).getByRole('button', { name: /^closed/i })
    expect(closedChip).toHaveAttribute('aria-pressed', 'true')
    expect(closedChip).toHaveTextContent(`Closed${tileCount}`)

    // Chips are the same filter; an empty bucket says so; "All" brings every agent back.
    await user.click(within(chips).getByRole('button', { name: /^hidden/i }))
    expect(await screen.findByText(/Agent 009 · Ibrahim Cash Point/)).toBeInTheDocument()
    expect(screen.queryByText(/Agent 038/)).not.toBeInTheDocument()
    await user.click(within(chips).getByRole('button', { name: /^limited/i }))
    expect(await screen.findByText(/no agent is on small or none right now/i)).toBeInTheDocument()
    await user.click(within(chips).getByRole('button', { name: /^all/i }))
    expect(screen.getAllByText(/Agent \d{3} · /).length).toBe(5)
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
    const section = await screen.findByRole('region', { name: /likely to run short · \d+/i })
    expect(await within(section).findByText(/Agent 038 · Amadu Corner Shop/)).toBeInTheDocument()
    expect(within(section).getAllByText('Likely short by tomorrow').length).toBeGreaterThan(0)
    expect(within(section).getByText('Says no cash right now.')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/balance|SLE 12,400/i)
    // The forecast is a ranking: high before medium.
    const chips = screen.getAllByText(/likely short by tomorrow|watch this week/i).map((el) => el.textContent)
    const firstWatch = chips.indexOf('Watch this week')
    const lastShort = chips.lastIndexOf('Likely short by tomorrow')
    expect(firstWatch === -1 || lastShort < firstWatch).toBe(true)
  })

  it('puts the count on the dashboard, linking to the reasons', async () => {
    signIn(ALL)
    render(<App start="/dealer" />)
    const card = await screen.findByLabelText(/float forecast: \d+ likely short by tomorrow/i)
    expect(card).toHaveAttribute('href', '/dealer/float')
  })
})

describe('trust score', () => {
  it('shows each agent how often their word held up, and never as a customer-facing thing', async () => {
    signIn(ALL)
    render(<App start="/dealer/agents" />)
    const fatmata = (await screen.findByText(/Agent 024 · Fatmata's Shop/)).closest('a')!
    expect(within(fatmata).getByText('Mixed')).toHaveAttribute('title', '10 of 12 visits matched the status in the last 14 days.')
    const sento = screen.getByText(/Agent 031 · Sento Enterprise/).closest('a')!
    expect(within(sento).getByText('Reliable')).toBeInTheDocument()
    const amadu = screen.getByText(/Agent 038 · Amadu Corner Shop/).closest('a')!
    expect(within(amadu).getByText('No track record yet')).toBeInTheDocument()
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
    await screen.findByText(/usually handles/i)
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
