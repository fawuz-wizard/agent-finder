import { Capacitor } from '@capacitor/core'

/**
 * One door for a beep on the agent's phone: the closing reminder and "you seem to have left
 * the shop". In the Android shell it is a local notification with sound (the
 * @capacitor/local-notifications plugin); in a browser it is the Notification API where
 * allowed, and nothing where not. Scheduling is idempotent on the id, so a screen can
 * re-schedule on every load without stacking reminders.
 */
export interface Beep {
  /** Stable per purpose, so a re-schedule replaces the previous one. */
  id: number
  title: string
  body: string
  /** When to fire; omitted means now. */
  at?: Date
}

export const BEEP_CLOSING = 1001
export const BEEP_LEFT_SHOP = 1002

type Plugin = {
  requestPermissions(): Promise<{ display: string }>
  schedule(o: { notifications: { id: number; title: string; body: string; schedule?: { at: Date; allowWhileIdle?: boolean } }[] }): Promise<unknown>
  cancel(o: { notifications: { id: number }[] }): Promise<unknown>
}

async function plugin(): Promise<Plugin | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const mod = (await import('@capacitor/local-notifications')) as { LocalNotifications: Plugin }
    return mod.LocalNotifications
  } catch {
    return null
  }
}

/** Ask once. Returns whether beeps can be shown at all. */
export async function askToBeep(): Promise<boolean> {
  const p = await plugin()
  if (p) {
    try {
      return (await p.requestPermissions()).display === 'granted'
    } catch {
      return false
    }
  }
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

/** The browser cannot schedule for later; it holds the timer while the page lives. */
const timers = new Map<number, number>()

export async function beep(b: Beep): Promise<void> {
  const p = await plugin()
  if (p) {
    try {
      await p.cancel({ notifications: [{ id: b.id }] })
      await p.schedule({
        notifications: [{ id: b.id, title: b.title, body: b.body, ...(b.at ? { schedule: { at: b.at, allowWhileIdle: true } } : {}) }],
      })
    } catch {
      // No notification is better than a crash in the shell.
    }
    return
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const show = () => {
    try {
      new Notification(b.title, { body: b.body, tag: String(b.id) })
    } catch {
      // Some browsers refuse outside a user gesture; the in-app card still shows.
    }
  }
  const prev = timers.get(b.id)
  if (prev !== undefined) window.clearTimeout(prev)
  const wait = b.at ? b.at.getTime() - Date.now() : 0
  if (wait <= 0) show()
  else timers.set(b.id, window.setTimeout(show, Math.min(wait, 2_147_000_000)))
}

export async function cancelBeep(id: number): Promise<void> {
  const p = await plugin()
  if (p) {
    try {
      await p.cancel({ notifications: [{ id }] })
    } catch {
      // Nothing to cancel.
    }
    return
  }
  const prev = timers.get(id)
  if (prev !== undefined) {
    window.clearTimeout(prev)
    timers.delete(id)
  }
}
