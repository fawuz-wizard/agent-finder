import '@testing-library/jest-dom/vitest'

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
