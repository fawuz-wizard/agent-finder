/** Runtime configuration. Only VITE_* variables reach the browser; secrets never do. */
const env = import.meta.env

export const config = {
  apiBaseUrl: (env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000',
  googleMapsApiKey: (env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '',
  googleMapsMapId: (env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) ?? '',
  authMode: ((env.VITE_AUTH_MODE as string | undefined) ?? 'demo') as 'demo' | 'otp',
  isDemo: ((env.VITE_AUTH_MODE as string | undefined) ?? 'demo') === 'demo',
  /** 'mock' serves the seeded demo network; 'live' calls the FastAPI backend. */
  apiMode: ((env.VITE_API_MODE as string | undefined) ?? 'mock') as 'mock' | 'live',
  useLiveApi: ((env.VITE_API_MODE as string | undefined) ?? 'mock') === 'live',
  /**
   * Demo only: simulate the operator's activity feed, so capacity is read from transactions
   * and agents are never asked to refresh. Off for the pilot with real agents.
   */
  operatorFeed: ((env.VITE_OPERATOR_FEED as string | undefined) ?? 'off') === 'on',
  /** Results re-query cadence while the results screen is visible (architecture §9). */
  searchRefreshMs: 30_000,
  /**
   * How long after taking directions the outcome question appears. Fifteen minutes in a real
   * deployment; seconds in demo mode so the reporting loop can be shown end to end.
   */
  outcomePromptAfterMs: ((env.VITE_AUTH_MODE as string | undefined) ?? 'demo') === 'demo' ? 20_000 : 15 * 60_000,
  maxResults: 10,
  /**
   * Which app this build is. One codebase ships as two installs: the customer's Agent Finder
   * (opens on the host home) and the Agent App for agents and dealers (opens on sign-in).
   */
  surface: ((env.VITE_APP_SURFACE as string | undefined) === 'agent' ? 'agent' : 'customer') as 'customer' | 'agent',
} as const
