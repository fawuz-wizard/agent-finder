import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TILE, fromTile, toTile } from '@/lib/tiles'
import { PinMap } from './PinMap'
import { pointer } from '@/test-utils/pointer'

const DEFAULT_ZOOM = 17

describe('PinMap', () => {
  it('maps a point to tiles and back', () => {
    const t = toTile(8.4657, -13.2317, 17)
    const back = fromTile(t.x, t.y, 17)
    expect(back.lat).toBeCloseTo(8.4657, 5)
    expect(back.lng).toBeCloseTo(-13.2317, 5)
    // Freetown sits on OpenStreetMap's tile 60718/62442 at zoom 17.
    expect(Math.floor(t.x)).toBe(60718)
    expect(Math.floor(t.y)).toBe(62442)
  })

  it('draws OpenStreetMap tiles around the centre and shows the coordinates', () => {
    render(<PinMap lat={8.4657} lng={-13.2317} label="the shop" />)
    const imgs = document.querySelectorAll('img')
    expect(imgs.length).toBeGreaterThan(4)
    expect(imgs[0]!.getAttribute('src')).toMatch(/^https:\/\/tile\.openstreetmap\.org\/17\/\d+\/\d+\.png$/)
    expect(screen.getByRole('img', { name: 'Map: the shop' })).toBeInTheDocument()
    expect(screen.getByText('8.46570, -13.23170')).toBeInTheDocument()
    expect(screen.getByText(/OpenStreetMap/)).toBeInTheDocument()
  })

  it('in move mode, dragging the map under the pin reports the new centre; in view mode it does not', () => {
    const onMove = vi.fn()
    const { unmount } = render(<PinMap lat={8.4657} lng={-13.2317} mode="move" onMove={onMove} />)
    const map = screen.getByRole('img', { name: 'Map' })
    pointer(map, 'pointerdown', 100, 100)
    pointer(map, 'pointermove', 100, 100 + TILE)
    pointer(map, 'pointerup', 100, 100 + TILE)
    expect(onMove).toHaveBeenCalledTimes(1)
    const pt = onMove.mock.calls[0]![0] as { lat: number; lng: number }
    // Dragging the map down by one tile moves the pin one tile north: a larger latitude, same longitude.
    const t = toTile(8.4657, -13.2317, DEFAULT_ZOOM)
    const expected = fromTile(t.x, t.y - 1, DEFAULT_ZOOM)
    expect(pt.lat).toBeCloseTo(expected.lat, 4)
    expect(pt.lng).toBeCloseTo(-13.2317, 4)
    unmount()
    const still = vi.fn()
    render(<PinMap lat={8.4657} lng={-13.2317} onMove={still} />)
    const view = screen.getByRole('img', { name: 'Map' })
    pointer(view, 'pointerdown', 0, 0)
    pointer(view, 'pointermove', 50, 50)
    pointer(view, 'pointerup', 50, 50)
    expect(still).not.toHaveBeenCalled()
  })
})
