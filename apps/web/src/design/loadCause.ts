export type Cause = 'offline' | 'slow' | 'server'

/** Which of the three a failed request was, from the message the API client gives (lib/api.ts). */
export function causeOf(message: string | null | undefined): Cause {
  const m = (message ?? '').toLowerCase()
  if (/offline|no connection|network/.test(m)) return 'offline'
  if (/too long|signal/.test(m)) return 'slow'
  return 'server'
}
