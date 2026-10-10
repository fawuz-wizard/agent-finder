import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCoarseLocation } from './useCoarseLocation'

afterEach(() => vi.unstubAllGlobals())

function phone(answer: (ok: (p: unknown) => void, fail: (e: { code: number }) => void) => void) {
  const listeners: Array<() => void> = []
  const status = { state: 'denied', addEventListener: (_: string, fn: () => void) => listeners.push(fn), removeEventListener: vi.fn() }
  const getCurrentPosition = vi.fn(answer)
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: { getCurrentPosition },
    permissions: { query: () => Promise.resolve(status) },
  })
  return { getCurrentPosition, status, flip: () => listeners.forEach((fn) => fn()) }
}

describe('useCoarseLocation', () => {
  it('says why when the phone refuses, and asks again by itself once the permission is granted', async () => {
    let granted = false
    const p = phone((ok, fail) => (granted ? ok({ coords: { latitude: 8.4701, longitude: -13.2609 } }) : fail({ code: 1 })))
    const { result } = renderHook(() => useCoarseLocation(true))
    await waitFor(() => expect(result.current.state).toBe('denied'))
    expect(result.current.problem?.reason).toBe('permission')
    expect(result.current.problem?.advice).toMatch(/Allow location/)

    granted = true
    p.status.state = 'granted'
    await act(async () => p.flip())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.point).toEqual({ lat: 8.47, lng: -13.261 })
    expect(p.getCurrentPosition).toHaveBeenCalledTimes(2)
  })

  it('tells location-off apart from a blocked permission', async () => {
    phone((_ok, fail) => fail({ code: 2 }))
    const { result } = renderHook(() => useCoarseLocation(true))
    await waitFor(() => expect(result.current.state).toBe('unavailable'))
    expect(result.current.problem?.reason).toBe('off')
  })
})

describe('useCoarseLocation in the Android shell', () => {
  it('raises the system dialog when location is switched off, then reads the position', async () => {
    const { nativeLocation } = await import('@/lib/nativeLocation')
    let on = false
    const turnOn = vi.spyOn(nativeLocation, 'turnOn').mockImplementation(async () => {
      on = true
      return { enabled: true, permission: 'granted', accepted: true }
    })
    vi.spyOn(nativeLocation, 'available').mockReturnValue(true)
    const p = phone((ok, fail) => (on ? ok({ coords: { latitude: 8.4701, longitude: -13.2609 } }) : fail({ code: 2 })))
    const { result } = renderHook(() => useCoarseLocation(true))
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(turnOn).toHaveBeenCalledTimes(1)
    expect(p.getCurrentPosition).toHaveBeenCalledTimes(2)
    vi.restoreAllMocks()
  })

  it('offers the dialog only once by itself; Turn on location shows it again', async () => {
    const { nativeLocation } = await import('@/lib/nativeLocation')
    const turnOn = vi.spyOn(nativeLocation, 'turnOn').mockResolvedValue({ enabled: false, permission: 'granted' })
    vi.spyOn(nativeLocation, 'available').mockReturnValue(true)
    const p = phone((_ok, fail) => fail({ code: 2 }))
    const { result } = renderHook(() => useCoarseLocation(true))
    await waitFor(() => expect(result.current.state).toBe('unavailable'))
    await waitFor(() => expect(turnOn).toHaveBeenCalledTimes(1))
    expect(p.getCurrentPosition).toHaveBeenCalledTimes(1)
    await act(async () => result.current.turnOn())
    await waitFor(() => expect(turnOn).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(p.getCurrentPosition).toHaveBeenCalledTimes(2))
    vi.restoreAllMocks()
  })
})
