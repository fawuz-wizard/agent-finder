import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The Android shell must package the same build the browser runs and present it from an
 * origin the API's CORS list allows. A silent change here breaks every phone at once.
 */
async function loadConfig() {
  vi.resetModules()
  return (await import('../../capacitor.config')).default
}

afterEach(() => vi.unstubAllEnvs())

describe('Android shell', () => {
  it('packages the web build from dist under the https://localhost origin by default', async () => {
    vi.stubEnv('CAP_ALLOW_HTTP', '')
    const config = await loadConfig()
    expect(config.appId).toBe('com.agentfinder.app')
    expect(config.appName).toBe('Agent Finder')
    expect(config.webDir).toBe('dist')
    expect(config.server?.androidScheme).toBe('https')
    expect(config.android?.allowMixedContent).toBe(false)
  })

  it('never points the shell at a remote page: the screens ship inside the APK', async () => {
    const config = await loadConfig()
    expect(config.server?.url).toBeUndefined()
  })

  it('serves the page from http://localhost only for a hotspot build against a plain-http API', async () => {
    vi.stubEnv('CAP_ALLOW_HTTP', '1')
    const config = await loadConfig()
    expect(config.server?.androidScheme).toBe('http')
    expect(config.android?.allowMixedContent).toBe(true)
  })
})
