import { describe, expect, it } from 'vitest'
import { customerApi, setOperatorFeedDemo } from './customerApi'
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

describe('demo customer network — the operator feed', () => {
  it('answers from the simulated position and says where the freshness comes from', async () => {
    setOperatorFeedDemo(true)
    try {
      await new Promise((r) => setTimeout(r, 20))
      // Midday pinned clock: Fatmata's 12,400 minus 5/13 of the day's 85% drain leaves 8,347.
      expect(fatmata(await search(8000)).outcome).toBe('likely')
      expect(fatmata(await search(8400)).outcome).toBe('limited')
      expect(fatmata(await search(8000)).freshness_text).toMatch(/Orange \(demo\)/)
      const text = JSON.stringify(await search(8000))
      expect(text).not.toMatch(/8,347|8347|balance|"most"|"some"/)
    } finally {
      setOperatorFeedDemo(false)
    }
  })
})

describe('demo customer network — the activity ranker', () => {
  it('puts the agent with a live position and margin first, and never exposes the score', async () => {
    setOperatorFeedDemo(true)
    try {
      await new Promise((r) => setTimeout(r, 20))
      const res = await search(2000)
      // Kadiatu's Kiosk is "most" by word and fresh, but has no feed; Fatmata's position was read minutes ago.
      expect(res.recommended[0]!.name).toBe("Fatmata's Shop")
      expect(JSON.stringify(res)).not.toMatch(/probability|features|trust/)
    } finally {
      setOperatorFeedDemo(false)
    }
  })
})
