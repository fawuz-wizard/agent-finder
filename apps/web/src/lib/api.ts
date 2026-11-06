/**
 * Typed API client. One place knows the base URL, the error envelope and the request id.
 * Response types will be generated from the API's OpenAPI document in a later stage.
 */
import { config } from './config'

export interface ApiError {
  code: string
  message: string
  request_id: string | null
  details?: unknown
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly error: ApiError,
  ) {
    super(error.message)
  }
}

export interface HealthResponse {
  status: string
  service: string
  version: string
  environment: string
}

/**
 * Bearer token of the signed-in agent or dealer. The auth feature owns the session; this
 * module only reads the token so every operator request carries it. Customers have no token.
 */
function bearer(): string | null {
  try {
    const raw = sessionStorage.getItem('af.session')
    if (!raw) return null
    const parsed = JSON.parse(raw) as { token?: string }
    return parsed.token ?? null
  } catch {
    return null
  }
}

/**
 * A random, non-identifying key for this browser so the pilot can count distinct customers.
 * It carries no name, number or location and is never a financial value.
 */
const CLIENT_KEY = 'af.client'
function clientKey(): string {
  try {
    let key = localStorage.getItem(CLIENT_KEY)
    if (!key) {
      key = crypto.randomUUID()
      localStorage.setItem(CLIENT_KEY, key)
    }
    return key
  } catch {
    return 'anon'
  }
}

/** A request that has not answered by then is given up, so a stalled 2G link never leaves
 * "Loading…" or "Sending…" on screen for minutes. Uploads get longer. */
export const REQUEST_TIMEOUT_MS = 20_000
export const UPLOAD_TIMEOUT_MS = 120_000

/** Fired when the server says this browser's sign-in has ended; the session provider listens. */
export const SESSION_ENDED_EVENT = 'af:session-ended'

export function offlineError(): ApiRequestError {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  return new ApiRequestError(0, {
    code: offline ? 'offline' : 'network_error',
    message: offline
      ? "You're offline. Check your data or Wi-Fi, then try again."
      : 'No connection. Check your network and try again.',
    request_id: null,
  })
}

function timeoutError(): ApiRequestError {
  return new ApiRequestError(0, {
    code: 'timeout',
    message: 'Taking too long. Your signal may be weak. Try again.',
    request_id: null,
  })
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  let res: Response
  const token = bearer()
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const outer = init?.signal
  const onOuterAbort = () => controller.abort()
  if (outer) {
    if (outer.aborted) controller.abort()
    else outer.addEventListener('abort', onOuterAbort, { once: true })
  }
  try {
    res = await fetch(`${config.apiBaseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Client': clientKey(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    })
  } catch (cause) {
    if (timedOut) throw timeoutError()
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw offlineError()
  } finally {
    clearTimeout(timer)
    outer?.removeEventListener('abort', onOuterAbort)
  }
  // A signed-in request refused as signed out: the session ended on the server (expired,
  // signed out from another phone, PIN changed). The app sends the person back to sign in.
  if (res.status === 401 && token && !path.startsWith('/api/v1/auth/sign-in')) {
    window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT))
  }
  if (!res.ok) {
    let body: { error?: ApiError } = {}
    try {
      body = (await res.json()) as { error?: ApiError }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiRequestError(res.status, body.error ?? { code: 'http_error', message: res.statusText, request_id: null })
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  health: () => request<HealthResponse>('/health'),
  /** A text body (CSV) from an authenticated GET. */
  text: async (path: string): Promise<string> => {
    const res = await fetch(`${config.apiBaseUrl}${path}`, {
      headers: { Accept: 'text/csv', 'X-Client': clientKey(), ...(bearer() ? { Authorization: `Bearer ${bearer()}` } : {}) },
    }).catch(() => {
      throw offlineError()
    })
    if (!res.ok) throw new ApiRequestError(res.status, { code: 'http_error', message: res.statusText, request_id: null })
    return res.text()
  },
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'GET', signal: signal ?? null }),
  post: <T>(path: string, body: unknown, signal?: AbortSignal, headers?: Record<string, string>) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body), signal: signal ?? null, ...(headers ? { headers } : {}) }),
  put: <T>(path: string, body: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body), signal: signal ?? null }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  /** A POST the server may take a while over (applying a national report): the upload's longer limit. */
  postLong: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }, UPLOAD_TIMEOUT_MS),
  /** A file as the request body, as it is (no JSON, no form): the server reads its content. */
  upload: <T>(path: string, file: Blob, headers?: Record<string, string>) =>
    request<T>(path, { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream', ...(headers ?? {}) } }, UPLOAD_TIMEOUT_MS),
}
