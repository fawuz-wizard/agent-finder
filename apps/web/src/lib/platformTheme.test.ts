import { beforeEach, describe, expect, it } from 'vitest'
import { readPlatformTheme, writePlatformTheme } from './platformTheme'

describe('the platform theme', () => {
  beforeEach(() => localStorage.clear())

  it('is dark until this phone says otherwise, and remembers light', () => {
    expect(readPlatformTheme()).toBe('dark')
    expect(writePlatformTheme('light')).toBe('light')
    expect(readPlatformTheme()).toBe('light')
    writePlatformTheme('dark')
    expect(readPlatformTheme()).toBe('dark')
  })

  it('treats anything unexpected in storage as dark', () => {
    localStorage.setItem('af.platformTheme', 'purple')
    expect(readPlatformTheme()).toBe('dark')
  })
})
