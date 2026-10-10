import { beforeEach, describe, expect, it } from 'vitest'
import { readRecent, rememberRecent, whenLabel } from './recent'

const DAY = 24 * 60 * 60 * 1000

describe('recent shops', () => {
  beforeEach(() => localStorage.clear())

  it('keeps the last three, newest first, each shop once', () => {
    rememberRecent({ id: 'a', name: 'A', area: 'Lumley' }, 1)
    rememberRecent({ id: 'b', name: 'B', area: 'Lumley' }, 2)
    rememberRecent({ id: 'c', name: 'C', area: 'Aberdeen' }, 3)
    rememberRecent({ id: 'a', name: 'A', area: 'Lumley' }, 4)
    rememberRecent({ id: 'd', name: 'D', area: 'Lumley' }, 5)
    expect(readRecent().map((r) => r.id)).toEqual(['d', 'a', 'c'])
  })

  it('ignores a broken store', () => {
    localStorage.setItem('af.recentAgents', '{not json')
    expect(readRecent()).toEqual([])
    localStorage.setItem('af.recentAgents', JSON.stringify([{ id: 1 }, { id: 'x', name: 'X', area: 'Lumley', at: 1 }]))
    expect(readRecent().map((r) => r.id)).toEqual(['x'])
  })

  it('says when, the way the design writes it', () => {
    const noon = new Date(2026, 9, 10, 12, 0, 0).getTime()
    expect(whenLabel(noon - 60_000, noon)).toBe('today')
    expect(whenLabel(noon - DAY, noon)).toBe('yesterday')
    expect(whenLabel(noon - 3 * DAY, noon)).toBe('3 days ago')
  })
})
