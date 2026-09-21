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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    const token = bearer()
    res = await fetch(`${config.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Client': clientKey(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiRequestError(0, {
      code: 'network_error',
      message: 'No connection. Check your network and try again.',
      request_id: null,
    })
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
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'GET', signal: signal ?? null }),
  post: <T>(path: string, body: unknown, signal?: AbortSignal, headers?: Record<string, string>) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body), signal: signal ?? null, ...(headers ? { headers } : {}) }),
}
