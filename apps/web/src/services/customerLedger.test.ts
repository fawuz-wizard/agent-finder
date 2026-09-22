import { describe, expect, it } from 'vitest'
import { customerApi } from './customerApi'
import type { AgentResult, SearchResponse } from '@/types/public'

function fatmata(res: SearchResponse): AgentResult {
  const all = [...res.recommended, ...res.closer_not_serving, ...res.results]
  return all.find((r) => r.name === "Fatmata's Shop")!
}

async function search(amount: number, transaction: 'cash_out' | 'deposit' = 'cash_out') {
  return customerApi.search({ transaction, amount_sle: amount, area: 'Lumley', radius_m: 2000 })
}

describe('demo customer network — visits move the answer like the live API', () => {
  it('a failed visit for lack of money caps that side; the other side and smaller amounts stay likely', async () => {
    expect(fatmata(await search(8000)).outcome).toBe('likely')
    await customerApi.report({
      agent_id: 'af-4821',
      transaction: 'cash_out',
      amount_sle: 8000,
      answer: 'no',
      reason_code: 'could_not_complete',
      source: 'search',
      client_token: 'tok-cap-0001',
    })
    expect(fatmata(await search(8000)).outcome).toBe('limited')
    expect(fatmata(await search(5000)).outcome).toBe('likely')
    expect(fatmata(await search(8000, 'deposit')).outcome).toBe('likely')
    // Customers still never see a number or a word about the agent.
    const text = JSON.stringify(await search(8000))
    expect(text).not.toMatch(/"most"|"some"|"small"|_sle":\s*[0-9]+,"(?!amount)/)
  })

  it('reaches the agent side through the same report, without operator code in the customer bundle', async () => {
    await new Promise((r) => setTimeout(r, 20))
    const { demoAgentHome } = await import('./operatorDemo')
    const home = demoAgentHome('Agent 024')
    expect(home.declaration.confirm_reason).toMatch(/failed cash out of SLE 5,000 to 10,000/)
    expect(home.customers_see.sides[0]!.range_text).toBe('up to SLE 5,000')
  })
})
