import type { DealerOverview } from '@/types/operator'

/**
 * The aggregator overview the last screen read, kept for this page view only, so Needs
 * attention opens with what Home already loaded and refreshes behind it. Never stored.
 */
let last: DealerOverview | null = null
export const readOverview = () => last
export function keepOverview(o: DealerOverview | null) {
  if (o) last = o
}
