import { describe, expect, it } from 'vitest'
import { demoFloatForecast, demoLogTransaction } from './operatorDemo'

const fatmata = () => demoFloatForecast().find((f) => f.agent_name === "Fatmata's Shop")!

describe('the demo float forecast, as the API', () => {
  it('learns its pace from every transaction the agent recorded, cash ins offsetting cash outs', () => {
    expect(fatmata().reasons).toContain('Recorded 6 cash outs and 6 cash ins in the last 7 days.')
    expect(fatmata().reasons.some((r) => r.startsWith('Confirmed visits'))).toBe(false)
    demoLogTransaction('Agent 024', { transaction: 'cash_out', amount_sle: 4_000, client_token: 'tok-demo-fc-1' })
    expect(fatmata().reasons).toContain('Recorded 7 cash outs and 6 cash ins in the last 7 days.')
  })

  it('says so when cash ins brought back as much cash as cash outs took out', () => {
    const amadu = demoFloatForecast().find((f) => f.agent_name === 'Amadu Corner Shop')!
    expect(amadu.reasons).toContain('Recorded 0 cash outs and 1 cash in in the last 7 days.')
    expect(amadu.reasons).not.toContain('Cash ins brought back as much cash as cash outs took out.')
  })
})
