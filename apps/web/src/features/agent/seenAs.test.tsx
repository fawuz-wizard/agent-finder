import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { SeenAsCard } from './components/SeenAsCard'
import { operatorApi } from '@/services/operatorApi'
import { customerApi } from '@/services/customerApi'
import type { AgentResult, SearchResponse } from '@/types/public'

function fatmata(res: SearchResponse): AgentResult {
  return [...res.recommended, ...res.results, ...res.closer_not_serving, ...(res.further_away ?? [])].find((r) => r.name === "Fatmata's Shop")!
}

describe('how customers see the agent, under the 7-day rule (demo)', () => {
  it('the agent and the aggregator read the same words; recording today adds a day the customer sees', async () => {
    const before = fatmata(await customerApi.search({ transaction: 'cash_out', amount_sle: 300, area: 'Lumley' }))
    expect(before.served_pct).toBe(90)

    const home = await operatorApi.home('Agent 024')
    expect(home.seen_as!.sides.map((s) => s.phrase)).toEqual(['Likely to be served', 'Likely to be served'])
    expect(home.seen_as!.why[0]!.title).toBe('You worked 6 of the last 7 days')
    const page = await operatorApi.dealerAgent('Agent 024')
    expect(page.seen_as!.sides).toEqual(home.seen_as!.sides)
    expect(page.seen_as!.why[0]!.title).toBe('Worked 6 of the last 7 days')
    expect(JSON.stringify([home.seen_as, page.seen_as])).not.toMatch(/%|served_pct/)

    await operatorApi.logTransaction('Agent 024', { transaction: 'cash_out', amount_sle: 1_000, client_token: 'seen-as-0001' })
    expect((await operatorApi.home('Agent 024')).seen_as!.why[0]!.title).toBe('You worked all 7 days')
    expect(fatmata(await customerApi.search({ transaction: 'cash_out', amount_sle: 300, area: 'Lumley' })).served_pct).toBe(95)

    // A size the agent has not done this week: capped, and the customer is told why.
    const big = fatmata(await customerApi.search({ transaction: 'cash_out', amount_sle: 20_000, area: 'Lumley' }))
    expect(big.served_pct).toBe(50)
    expect(big.note).toBe('Not seen at this size this week')
  })

  it('draws one status per type and the reasons, with no figure on screen', () => {
    render(
      <MemoryRouter>
        <SeenAsCard
          name="Kamara Money Point"
          street="Lumley Beach Road"
          note={{
            sides: [
              { label: 'Cash out', outcome: 'likely', phrase: 'Likely to be served' },
              { label: 'Cash in', outcome: 'limited', phrase: 'Not done this week' },
            ],
            why: [{ tone: 'warn', title: 'You worked 4 of the last 7 days', detail: 'Record every day you work. Days count, not how many transactions.' }],
          }}
        />
      </MemoryRouter>,
    )
    const card = screen.getByRole('article', { name: /how customers see this listing/i })
    expect(within(card).getByText('Not done this week')).toBeInTheDocument()
    expect(screen.getByText('You worked 4 of the last 7 days')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\d+%/)
  })
})
