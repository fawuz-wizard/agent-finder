import { describe, expect, it } from 'vitest'
import type { DealerAgentRow } from '@/types/operator'
import { agentMatches, parseQuery, summaryLine } from './dealerSearches'

const base: DealerAgentRow = {
  ref: 'Agent 024', name: "Fatmata's Shop", person_name: 'Fatmata Kamara', area: 'Lumley Junction', agent_code: '100245', phone: '+23276000024',
  presence: 'open', presence_text: 'Open · serving', bucket: 'active', declaration_text: 'Most / Some', freshness_text: '5 min ago', attention: false,
  reliability: { label: 'reliable', label_text: 'Reliable', text: '', score: 1, matched: 1, visits: 1 } as DealerAgentRow['reliability'],
  capacity_text: '', located: true, location_confirmed: true, active: true, region: 'west', city: 'Freetown', source: 'manual',
  pending_float: false, photo: false, verified: true,
}
const away: DealerAgentRow = { ...base, ref: 'Agent 009', name: 'Ibrahim Cash Point', person_name: 'Ibrahim Sesay', area: 'Wilberforce', agent_code: '100309', phone: '+23276000009', presence: 'hidden', bucket: 'hidden', attention: true, pending_float: true, region: 'north', source: 'orange_file', verified: false, photo: true }
const offMap: DealerAgentRow = { ...base, ref: 'Agent 101', name: 'Hill Top', area: 'Hill Station', located: false, location_confirmed: false, reliability: { ...base.reliability, label: 'new' } }
const inactive: DealerAgentRow = { ...base, ref: 'Agent 102', name: 'Old Store', area: 'Kissy Road', active: false, presence: 'closed', bucket: 'closed' }

describe('the Search box', () => {
  it('reads words as facts and keeps the rest as text', () => {
    const p = parseQuery('closed Lumley')
    expect(p.keywords.map((k) => k.key)).toEqual(['closed'])
    expect(p.text).toBe('lumley')
    expect(parseQuery('not on map west').keywords.map((k) => k.key)).toEqual(['unlocated', 'west'])
    expect(parseQuery('no photo').keywords.map((k) => k.key)).toEqual(['no_photo'])
    expect(parseQuery("Fatmata's").keywords).toEqual([])
  })

  it('narrows by every word, and the text must match too', () => {
    const all = [base, away, offMap, inactive]
    const find = (q: string) => all.filter((a) => agentMatches(a, q)).map((a) => a.ref)
    expect(find('away')).toEqual(['Agent 009'])
    expect(find('active')).toEqual(['Agent 024', 'Agent 101'])
    expect(find('inactive')).toEqual(['Agent 102'])
    expect(find('not on map')).toEqual(['Agent 101'])
    expect(find('attention')).toEqual(['Agent 009'])
    expect(find('float')).toEqual(['Agent 009'])
    expect(find('photo')).toEqual(['Agent 009'])
    expect(find('no photo')).toEqual(['Agent 024', 'Agent 101', 'Agent 102'])
    expect(find('verified')).toEqual(['Agent 024', 'Agent 101', 'Agent 102'])
    expect(find('new')).toEqual(['Agent 101'])
    expect(find('north')).toEqual(['Agent 009'])
    expect(find('orange file')).toEqual(['Agent 009'])
    expect(find('registered')).toEqual(['Agent 024', 'Agent 101', 'Agent 102'])
    expect(find('active lumley')).toEqual(['Agent 024'])
    expect(find('active hill')).toEqual(['Agent 101'])
    expect(find('closed lumley')).toEqual([])
    expect(find('away west')).toEqual([])
  })

  it('still finds by name, person, number, code, phone in any spelling, street and town', () => {
    const all = [base, away]
    const find = (q: string) => all.filter((a) => agentMatches(a, q)).map((a) => a.ref)
    expect(find('fatmata')).toEqual(['Agent 024'])
    expect(find('Kamara')).toEqual(['Agent 024'])
    expect(find('24')).toEqual(['Agent 024'])
    expect(find('100245')).toEqual(['Agent 024'])
    expect(find('076 000 009')).toEqual(['Agent 009'])
    expect(find('+232 76 000 009')).toEqual(['Agent 009'])
    expect(find('76000009')).toEqual(['Agent 009'])
    expect(find('wilberforce')).toEqual(['Agent 009'])
    expect(find('freetown')).toEqual(['Agent 024', 'Agent 009'])
  })

  it('writes the summary with the facts and the total', () => {
    expect(summaryLine(1, 5, [])).toBe('1 agent')
    expect(summaryLine(2, 5, parseQuery('away west').keywords)).toBe('2 agents away, in the West · 5 in all')
  })
})
