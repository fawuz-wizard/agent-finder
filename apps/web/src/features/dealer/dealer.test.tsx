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
            <Route path="/dealer/agents/:ref" element={<DealerAgentDetailPage />} />
            <Route path="/dealer/float" element={<p>Float queue</p>} />
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
    expect(await screen.findByText('Float queue')).toBeInTheDocument()
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
