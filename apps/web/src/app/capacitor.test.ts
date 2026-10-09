import { describe, expect, it } from 'vitest'
import config from '../../capacitor.config'

/**
 * The Android shell must package the same build the browser runs and present it from the
 * origin the API's CORS list allows. A silent change here breaks every phone at once.
 */
describe('Android shell', () => {
  it('packages the web build from dist under the https://localhost origin', () => {
    expect(config.appId).toBe('com.agentfinder.app')
    expect(config.appName).toBe('Agent Finder')
    expect(config.webDir).toBe('dist')
    expect(config.server?.androidScheme).toBe('https')
  })

  it('never points the shell at a remote page: the screens ship inside the APK', () => {
    expect(config.server?.url).toBeUndefined()
    expect(config.android?.allowMixedContent).toBe(false)
  })
})
