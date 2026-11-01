import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { readPrefs } from '@/lib/prefs'
import { BEEP_LEFT_SHOP, BEEP_STAY_VISIBLE, beep, cancelBeep } from '@/lib/notify'
import { CHECK_EVERY_MS, CHECK_IN_NOW, REMIND_BEFORE_MS, atPin, distanceText, type Point } from '../shopPresence'
import { noteShopAlert } from '../notifications'

const AWAY_KEY = 'af.awayFromPin'

function wasAway(): boolean {
  try {
    return sessionStorage.getItem(AWAY_KEY) === '1'
  } catch {
    return false
  }
}
function setWasAway(v: boolean) {
  try {
    if (v) sessionStorage.setItem(AWAY_KEY, '1')
    else sessionStorage.removeItem(AWAY_KEY)
  } catch {
    // Fine without it: at worst the next notification repeats.
  }
}

const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/**
 * Checks the agent in at the shop pin while the app is open: when it opens or comes back to
 * the front, every five minutes, and when asked (after a transaction is recorded). The phone
 * compares its position with the pin and sends only yes or no. No question is ever asked:
 * leaving the pin hides the agent at once, with a notification that says so; coming back shows
 * them again, with another. After each check-in a reminder is set for fifteen minutes before
 * the two hours run out. With location off (or the agent's switch off) the app being open still
 * counts, and the aggregator is told the check is off. Renders nothing.
 */
export function ShopPresenceWatch() {
  const { session } = useSession()
  const ref = session?.ref ?? null
  const [shop, setShop] = useState<Point | null>(null)
  // Nothing is sent until the pin is known: a check before it loads would read as "location off".
  const [pinKnown, setPinKnown] = useState(false)
  const busy = useRef(false)

  useEffect(() => {
    if (!ref) return
    void operatorApi
      .profile(ref)
      .then((p) => {
        setShop(p.lat !== null && p.lng !== null ? { lat: p.lat, lng: p.lng } : null)
        setPinKnown(true)
      })
      .catch(() => setPinKnown(false))
  }, [ref])

  const send = useCallback(
    async (at: boolean | null, metres?: number) => {
      if (!ref) return
      try {
        const out = await operatorApi.checkIn(ref, at)
        const away = at === false
        if (away && !wasAway()) {
          noteShopAlert({ kind: 'left', ...(metres !== undefined ? { metres } : {}) })
          void beep({ id: BEEP_LEFT_SHOP, title: 'Your location has changed', body: `You are ${metres !== undefined ? distanceText(metres) : 'away'} from your shop pin. Customers can't see you until you're back.` })
        }
        if (!away && wasAway()) {
          noteShopAlert({ kind: 'back' })
          void beep({ id: BEEP_LEFT_SHOP, title: "You're back at your shop", body: 'Customers can find you again.' })
        }
        setWasAway(away)
        const c = out.checkin
        if (c && !away) {
          const remindAt = new Date(new Date(c.visible_until).getTime() - REMIND_BEFORE_MS)
          if (remindAt.getTime() > Date.now())
            void beep({ id: BEEP_STAY_VISIBLE, title: 'Open Agent Finder to stay visible', body: `No check-in at your shop since ${hm(c.last_at)}. Customers stop seeing you at ${hm(c.visible_until)}.`, at: remindAt })
        }
      } catch {
        // Offline: the next check tries again; the server keeps the last state it had.
      }
    },
    [ref],
  )

  const check = useCallback(() => {
    if (!ref || !pinKnown || busy.current) return
    const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined
    // No pin yet, no location on this phone, or the agent switched the check off: being open counts.
    if (!shop || !geo || !readPrefs().leftShopWatch) {
      void send(null)
      return
    }
    busy.current = true
    geo.getCurrentPosition(
      (pos) => {
        const r = atPin(shop, { lat: pos.coords.latitude, lng: pos.coords.longitude }, pos.coords.accuracy ?? 0)
        void send(r.at, r.metres).finally(() => (busy.current = false))
      },
      (err) => {
        busy.current = false
        // Location refused: the app being open counts, and the aggregator sees the check is off.
        // A fix that simply timed out says nothing either way: wait for the next check.
        if (err.code === err.PERMISSION_DENIED) void send(null)
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
    )
  }, [ref, shop, pinKnown, send])

  useEffect(() => {
    if (!ref) return
    check()
    const id = window.setInterval(check, CHECK_EVERY_MS)
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(CHECK_IN_NOW, check)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(CHECK_IN_NOW, check)
    }
  }, [ref, check])

  // Signed out: the reminder would only confuse.
  useEffect(() => {
    if (!ref) void cancelBeep(BEEP_STAY_VISIBLE)
  }, [ref])

  return null
}
