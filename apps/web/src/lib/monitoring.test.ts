import { describe, expect, it } from 'vitest'
import { initMonitoring, scrub } from './monitoring'

describe('error tracking', () => {
  it('is off without a DSN', async () => {
    expect(await initMonitoring()).toBe(false)
  })

  it('keeps only the path of the screen and drops the person', () => {
    const out = scrub<{ request?: { url?: string; headers?: object }; user?: unknown; breadcrumbs?: unknown; exception?: object }>({
      request: { url: 'https://app.example/find/results?tx=cash_out&amount=500&lat=8.48#top', headers: { a: 'b' } },
      user: { ip_address: '10.0.0.1' },
      breadcrumbs: [{ message: 'PIN 1234' }],
      exception: { values: [{ type: 'TypeError' }] },
    })
    expect(out.request).toEqual({ url: 'https://app.example/find/results' })
    expect(out).not.toHaveProperty('user')
    expect(out).not.toHaveProperty('breadcrumbs')
    expect(JSON.stringify(out)).not.toMatch(/8\.48|500|1234/)
  })
})
