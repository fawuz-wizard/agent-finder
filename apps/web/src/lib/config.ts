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
  /** Results re-query cadence while the results screen is visible (architecture §9). */
  searchRefreshMs: 30_000,
  /**
   * How long after taking directions the outcome question appears. Fifteen minutes in a real
   * deployment; seconds in demo mode so the reporting loop can be shown end to end.
   */
  outcomePromptAfterMs: ((env.VITE_AUTH_MODE as string | undefined) ?? 'demo') === 'demo' ? 20_000 : 15 * 60_000,
  maxResults: 10,
} as const
