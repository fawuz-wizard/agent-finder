import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// findBy… and waitFor wait up to 5 s (default 1 s), for the same reason as testTimeout.
configure({ asyncUtilTimeout: 5_000 })

// The demo network runs night mode 07:00–20:00 UTC, exactly as the API does. Shift the clock
// so every run starts at midday UTC: time still advances, timers stay real, and a test that
// wants fake timers (vi.useFakeTimers) layers on top of this as usual.
const RealDate = Date
const midday = new RealDate()
midday.setUTCHours(12, 0, 0, 0)
const OFFSET = midday.getTime() - RealDate.now()

class PinnedDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(RealDate.now() + OFFSET)
    else super(...(args as ConstructorParameters<typeof Date>))
  }
  static now(): number {
    return RealDate.now() + OFFSET
  }
}
globalThis.Date = PinnedDate as DateConstructor

// jsdom has no layout, so it leaves scrollIntoView out. Pages call it after a short delay to
// bring a section into view; without this stub the call throws after the test has finished
// and Vitest exits with an error even though every test passed.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
