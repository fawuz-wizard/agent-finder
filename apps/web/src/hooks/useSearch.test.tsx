import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSearch } from './useSearch'
import { customerApi } from '@/services/customerApi'
import { config } from '@/lib/config'
import type { SearchRequest } from '@/types/public'

const REQ: SearchRequest = { transaction: 'cash_out', amount_sle: 2000, area: 'Lumley', radius_m: 2000 }

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

describe('useSearch — polling', () => {
  beforeEach(() => {
    setOnline(true)
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('queries once on mount and again every 30 seconds while visible and online', async () => {
    const spy = vi.spyOn(customerApi, 'search')
    renderHook(() => useSearch(REQ))
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(config.searchRefreshMs + 100)
    })
    expect(spy).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(config.searchRefreshMs + 100)
    })
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('pauses while offline and keeps the previous answer, marked stale', async () => {
    const spy = vi.spyOn(customerApi, 'search')
    const { result } = renderHook(() => useSearch(REQ))
    await waitFor(() => expect(result.current.data).not.toBeNull())
    expect(spy).toHaveBeenCalledTimes(1)

    act(() => setOnline(false))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(config.searchRefreshMs * 3)
    })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(result.current.stale).toBe(true)
    expect(result.current.data).not.toBeNull()
  })

  it('stops polling once the screen is gone', async () => {
    const spy = vi.spyOn(customerApi, 'search')
    const { unmount } = renderHook(() => useSearch(REQ))
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(config.searchRefreshMs * 2)
    })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('surfaces a failure with a human sentence and no results', async () => {
    vi.spyOn(customerApi, 'search').mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useSearch(REQ))
    await waitFor(() => expect(result.current.state).toBe('error'))
    expect(result.current.error).toMatch(/could not reach/i)
    expect(result.current.data).toBeNull()
  })
})
