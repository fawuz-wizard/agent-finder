import { describe, expect, it } from 'vitest'
import { type Band, type Week, emptyWeek, score, weekNote } from './weekRule'

/** The same worked examples as the API's tests/test_week_rule.py: the two copies must agree. */
function week(days = 0, cash: Band[] = [], float: Band[] = [], served = 0, failed = 0): Week {
  const w = emptyWeek()
  w.activeDays = days
  cash.forEach((b) => w.bands.cash.add(b))
  float.forEach((b) => w.bands.float.add(b))
  w.served.cash = served
  w.failed.cash = failed
  return w
}

describe('the 7-day rule, demo copy', () => {
  it('reads the rule document’s worked examples', () => {
    expect(score(week(1, ['≤5k']), 'cash_out', 300)).toMatchObject({ pct: 40, outcome: 'limited', note: null })
    expect(score(week(4, ['≤5k'], [], 3), 'cash_out', 300)).toMatchObject({ pct: 80, outcome: 'likely' })
    expect(score(week(7, [], ['≤2k']), 'cash_out', 300)).toMatchObject({ pct: 35, note: 'Does cash in; no cash out this week' })
    expect(score(week(7, ['≤500'], [], 4), 'cash_out', 300).pct).toBe(95)
    expect(score(week(7, ['≤500'], [], 4), 'cash_out', 5_000)).toMatchObject({ pct: 50, note: 'Not seen at this size this week' })
    expect(score(week(7, ['≤2k'], [], 3, 3), 'cash_out', 300).pct).toBe(75)
    expect(score(week(0), 'cash_out', 300)).toMatchObject({ pct: 5, outcome: 'unknown', active: false })
  })

  it('ignores fewer than three reports and never counts volume', () => {
    expect(score(week(7, ['≤2k'], [], 0, 2), 'cash_out', 300).pct).toBe(75)
    expect(score(week(7, ['≤500', '≤2k', '≤5k', '≤10k']), 'cash_out', null).pct).toBe(score(week(7, ['≤500']), 'cash_out', null).pct)
  })

  it('caps the side the agent said is low or empty today', () => {
    const w = week(7, ['≤5k'], [], 4)
    expect(score(w, 'cash_out', 300, 'low').pct).toBe(35)
    expect(score(w, 'cash_out', 300, 'none').pct).toBe(5)
  })

  it('gives agents and aggregators words, never the figure', () => {
    const mine = weekNote(week(4, ['≤5k'], [], 3), [null, null])
    expect(mine.sides.map((s) => s.phrase)).toEqual(['Likely to be served', 'Not done this week'])
    expect(mine.why.map((w) => w.title)).toEqual(['You worked 4 of the last 7 days', 'Cash out done this week; cash in not', 'Customers: 3 served, none failed'])
    const theirs = weekNote(week(4, ['≤5k'], [], 3), [null, null], 'dealer')
    expect(theirs.why[0]!.title).toBe('Worked 4 of the last 7 days')
    expect(JSON.stringify(theirs)).not.toMatch(/%|pct|points/)
  })
})
