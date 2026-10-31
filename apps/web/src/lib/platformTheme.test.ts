import { beforeEach, describe, expect, it } from 'vitest'
import { readPlatformTheme, writePlatformTheme } from './platformTheme'

describe('the platform theme', () => {
  beforeEach(() => localStorage.clear())

  it('is light until this phone says otherwise, and remembers dark', () => {
    expect(readPlatformTheme()).toBe('light')
    expect(writePlatformTheme('dark')).toBe('dark')
    expect(readPlatformTheme()).toBe('dark')
    writePlatformTheme('light')
    expect(readPlatformTheme()).toBe('light')
  })

  it('treats anything unexpected in storage as light', () => {
    localStorage.setItem('af.platformTheme', 'purple')
    expect(readPlatformTheme()).toBe('light')
  })
})
