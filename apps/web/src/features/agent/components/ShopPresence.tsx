import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { BEEP_LEFT_SHOP, beep, cancelBeep } from '@/lib/notify'
import { FinderBox } from '@/features/end-user/components/finder'
import { PILL_ON, PILL_OFF } from './agentChrome'
import { AWAY_GRACE_MS, CHECK_EVERY_MS, presenceCall, type Point, type PresenceCall } from '../shopPresence'

const LEFT_KEY = 'af.leftShopSince'
const AUTO_KEY = 'af.autoAway'

function readNumber(key: string): number | null {
  try {
    const v = sessionStorage.getItem(key)
    return v ? Number(v) : null
  } catch {
    return null
  }
}
function write(key: string, v: string | null) {
  try {
    if (v === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, v)
  } catch {
    // Fine without it.
  }
}

/**
 * Watches, while the app is open, whether the agent is still at the pinned shop. Away from
 * it during open hours: a card and a beep, "set yourself Away?". Ten minutes later with no
 * answer: Away, said plainly, one tap back. The check runs every five minutes and whenever
 * the app comes back to the foreground. Nothing runs with the app closed.
 */
export function ShopPresenceWatch() {
  const { session } = useSession()
  const ref = session?.ref ?? null
  const [shop, setShop] = useState<Point | null>(null)
  const [presence, setPresence] = useState<'open' | 'hidden' | 'closed' | null>(null)
  const [nightMode, setNightMode] = useState(true)
  const [call, setCall] = useState<PresenceCall>({ kind: 'at_shop' })
  const [autoAway, setAutoAway] = useState<boolean>(() => readNumber(AUTO_KEY) !== null)
  const [busy, setBusy] = useState(false)
  const leftSince = useRef<number | null>(readNumber(LEFT_KEY))

  // The shop's pin and the agent's presence, read when the watch starts and after each change.
  const load = useCallback(async () => {
    if (!ref) return
    try {
      const [profile, home] = await Promise.all([operatorApi.profile(ref), operatorApi.home(ref)])
      setShop(profile.lat !== null && profile.lng !== null ? { lat: profile.lat, lng: profile.lng } : null)
      setPresence(home.declaration.presence)
      setNightMode(home.declaration.night_mode)
    } catch {
      // Without the pin there is nothing to compare; the watch stays quiet.
    }
  }, [ref])

  useEffect(() => {
    void load()
  }, [load])

  const check = useCallback(() => {
    if (!ref || !shop || presence !== 'open' || typeof navigator === 'undefined' || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const now = Date.now()
        const next = presenceCall(
          presence,
          shop,
          { lat: pos.coords.latitude, lng: pos.coords.longitude },
          leftSince.current,
          now,
          pos.coords.accuracy ?? 0,
        )
        if (next.kind === 'at_shop') {
          leftSince.current = null
          write(LEFT_KEY, null)
          setCall(next)
          void cancelBeep(BEEP_LEFT_SHOP)
          return
        }
        if (leftSince.current === null) {
          leftSince.current = now
          write(LEFT_KEY, String(now))
          void beep({
            id: BEEP_LEFT_SHOP,
            title: 'Have you left the shop?',
            body: `Your phone is ${next.metres} m from your pin. Set yourself Away, or you will be set Away in ${Math.round(AWAY_GRACE_MS / 60_000)} minutes.`,
          })
        }
        setCall(next)
      },
      () => {
        // No fix: nothing to say.
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
    )
  }, [ref, shop, presence])

  // Every five minutes while open, and whenever the app comes back to the front.
  useEffect(() => {
    check()
    const id = window.setInterval(check, CHECK_EVERY_MS)
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [check])

  const setAway = useCallback(
    async (auto: boolean) => {
      if (!ref || busy) return
      setBusy(true)
      try {
        await operatorApi.declare(ref, { presence: 'hidden', night_mode: nightMode })
        setPresence('hidden')
        setAutoAway(auto)
        write(AUTO_KEY, auto ? String(Date.now()) : null)
        setCall({ kind: 'at_shop' })
        void cancelBeep(BEEP_LEFT_SHOP)
        if (auto) void beep({ id: BEEP_LEFT_SHOP, title: 'Set to Away', body: 'You left the shop and did not answer, so customers are not sent to you. Open the app to undo.' })
      } finally {
        setBusy(false)
      }
    },
    [ref, busy, nightMode],
  )

  // The grace period ran out with no answer: Away, said plainly.
  useEffect(() => {
    if (call.kind !== 'auto_away') return
    void setAway(true)
  }, [call, setAway])
  useEffect(() => {
    if (call.kind !== 'left') return
    const id = window.setTimeout(check, call.autoAwayInMs + 500)
    return () => window.clearTimeout(id)
  }, [call, check])

  async function back() {
    if (!ref || busy) return
    setBusy(true)
    try {
      await operatorApi.declare(ref, { presence: 'open', night_mode: nightMode })
      setPresence('open')
      setAutoAway(false)
      write(AUTO_KEY, null)
      leftSince.current = null
      write(LEFT_KEY, null)
    } finally {
      setBusy(false)
    }
  }

  if (autoAway && presence === 'hidden') {
    return (
      <FinderBox className="mx-5 mt-3 flex flex-col gap-3 border-l-4 border-warning px-4 py-4" role="status">
        <p className="text-base font-bold">Away · you left the shop</p>
        <p className="text-sm font-medium text-finder-muted">Customers are not sent to you. Back at the shop?</p>
        <button type="button" onClick={() => void back()} disabled={busy} className={`h-chip self-start rounded-pill px-5 text-base font-bold ${PILL_ON}`}>
          {busy ? '…' : "I'm back, set me Open"}
        </button>
      </FinderBox>
    )
  }
  if (call.kind !== 'left') return null
  const minutes = Math.max(1, Math.ceil(call.autoAwayInMs / 60_000))
  return (
    <FinderBox className="mx-5 mt-3 flex flex-col gap-3 border-l-4 border-warning px-4 py-4" role="status">
      <p className="text-base font-bold">Have you left the shop?</p>
      <p className="text-sm font-medium text-finder-muted">
        Your phone is about {call.metres} m from your pin. If you say nothing, you will be set Away in {minutes} minute{minutes === 1 ? '' : 's'}, so customers are not sent to an empty shop.
      </p>
      <div className="flex gap-3">
        <button type="button" onClick={() => void setAway(false)} disabled={busy} className={`h-chip flex-1 rounded-pill text-base font-bold ${PILL_ON}`}>
          Set me Away
        </button>
        <button
          type="button"
          onClick={() => {
            leftSince.current = Date.now()
            write(LEFT_KEY, String(leftSince.current))
            setCall({ kind: 'at_shop' })
          }}
          disabled={busy}
          className={`h-chip flex-1 rounded-pill text-base font-bold ${PILL_OFF}`}
        >
          I'm still here
        </button>
      </div>
    </FinderBox>
  )
}
