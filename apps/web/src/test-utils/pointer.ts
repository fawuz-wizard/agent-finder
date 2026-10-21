import { act } from '@testing-library/react'

/**
 * jsdom has no PointerEvent. A MouseEvent carrying the pointer type reaches React's
 * onPointer* handlers with clientX/Y intact; each dispatch is wrapped in act so the state
 * the previous event set is rendered before the next one arrives.
 */
export function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number) {
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }))
  })
}
