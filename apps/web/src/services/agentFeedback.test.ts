import { describe, expect, it } from 'vitest'
import { customerApi } from './customerApi'
import { operatorApi } from './operatorApi'

const FEEDBACK_KEYS = ['comment', 'day_text', 'id', 'kind', 'rating', 'reason_text', 'transaction_label']

describe('demo: what customers say reaches the agent, never who said it', () => {
  it('a failed visit with a comment shows its reason, the day and the words, nothing else', async () => {
    await customerApi.report({
      agent_id: 'af-4821',
      transaction: 'cash_out',
      amount_sle: 2000,
      answer: 'no',
      reason_code: 'less_than_requested',
      comment: '  Only had 1,500 when I came for 2,000. ',
      source: 'search',
      client_token: 'tok-fb-00000001',
    })
    await new Promise((r) => setTimeout(r, 20))
    const fb = await operatorApi.feedback('Agent 024')
    const mine = fb.items.find((x) => x.comment === 'Only had 1,500 when I came for 2,000.')!
    expect(mine).toMatchObject({ kind: 'not_served', day_text: 'Today', transaction_label: 'Cash out', reason_text: 'Had less than the customer asked for', rating: null })
    expect(Object.keys(mine).sort()).toEqual(FEEDBACK_KEYS)
    expect(JSON.stringify(fb)).not.toMatch(/tok-fb|amount_|client|"at"|2000/)
    expect(fb.summary.not_served).toBeGreaterThanOrEqual(1)
    expect(fb.days).toBe(30)
  })

  it('a comment on its own reaches the agent too; another agent never sees it', async () => {
    await customerApi.report({
      agent_id: 'af-4821',
      transaction: null,
      amount_sle: null,
      answer: 'comment',
      comment: 'The queue moved fast.',
      source: 'direct',
      client_token: 'tok-fb-00000002',
    })
    await new Promise((r) => setTimeout(r, 20))
    const fat = await operatorApi.feedback('Agent 024')
    expect(fat.items.find((x) => x.comment === 'The queue moved fast.')).toMatchObject({ kind: 'comment', reason_text: null, transaction_label: null })
    const sento = await operatorApi.feedback('Agent 031')
    expect(JSON.stringify(sento)).not.toContain('The queue moved fast.')
  })

  it('customers still read no comment anywhere', async () => {
    const res = await customerApi.search({ transaction: 'cash_out', amount_sle: 2000, area: 'Lumley', radius_m: 500 })
    const detail = await customerApi.agent('af-4821', { transaction: 'cash_out', amount_sle: 2000, area: 'Lumley' })
    expect(JSON.stringify([res, detail])).not.toMatch(/queue moved|Only had|comment/)
  })
})
