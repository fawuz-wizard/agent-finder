import type { FloatRequest } from '@/types/operator'

const DAY_MS = 24 * 60 * 60 * 1000

/** The Dashboard's float row: its words, from the latest request whatever its state. */
export function floatRowText(latest: FloatRequest | null, now = Date.now()): string {
  if (!latest) return 'Request float'
  if (latest.state === 'pending') return 'Pending'
  if (latest.state === 'approved') return 'Approved'
  const finishedAt = latest.decided_at ? new Date(latest.decided_at).getTime() : new Date(latest.requested_at).getTime()
  if (now - finishedAt > DAY_MS) return 'Request float'
  if (latest.state === 'completed') return 'Completed'
  if (latest.state === 'declined') return 'Declined'
  return 'Request float'
}
