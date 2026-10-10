import { describe, expect, it } from 'vitest'
import { explainLocation, locationErrorText } from './location'

describe('why the phone gave no position', () => {
  it('names the cause from the browser error code', () => {
    expect(explainLocation({ code: 1 }).reason).toBe('permission')
    expect(explainLocation({ code: 2 }).reason).toBe('off')
    expect(explainLocation({ code: 3 }).reason).toBe('timeout')
    expect(explainLocation(null).reason).toBe('unsupported')
  })

  it('tells the customer how to turn it on', () => {
    expect(explainLocation({ code: 2 }).advice).toMatch(/turn on Location/)
    expect(explainLocation({ code: 1 }).advice).toMatch(/Settings › Apps › Agent Finder/)
  })

  it('falls back to the form\'s own sentence only when there is nothing to turn on', () => {
    expect(locationErrorText(null, 'Type the coordinates instead.')).toBe('Type the coordinates instead.')
    expect(locationErrorText({ code: 2 }, 'Type the coordinates instead.')).toMatch(/switched off on this phone/)
  })
})
