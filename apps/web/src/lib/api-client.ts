/**
 * HTTP client for the portal (TRY-BNP-PORTAL-01 §1, §20).
 *
 * The portal talks HTTP and never imports @triyara/core or @triyara/db, so this
 * is the single seam where the wire format is understood. It:
 *
 *   - unwraps the platform envelope { success, data, meta, errors }
 *   - captures the ETag, which every mutation needs for If-Match
 *   - normalises failures into one error type carrying status, code, field
 *     errors and the request id
 *
 * Nothing above this layer parses a response body or knows a status code.
 */

export interface ApiMeta {
  requestId: string
  pagination?: { limit: number; nextCursor: string | null }
  filters?: Record<string, unknown>
  sort?: string
  [key: string]: unknown
}

export interface ApiFieldError {
  code: string
  message: string
  field?: string
}

export interface ApiResult<T> {
  data: T
  meta: ApiMeta
  /** Weak ETag from the response, e.g. `W/"v3"`. Null on collections. */
  etag: string | null
  /** Parsed version from the ETag, for If-Match on the next write. */
  version: number | null
}

/**
 * Every failure the portal can see, in one shape.
 *
 * `status` drives the UI response table in §20; `errors` carries field-level
 * detail for React Hook Form; `requestId` is what a user quotes in a ticket and
 * what ties their complaint to the audit log.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly errors: ApiFieldError[]
  readonly requestId: string | undefined

  constructor(status: number, errors: ApiFieldError[], requestId?: string, message?: string) {
    super(message ?? errors[0]?.message ?? `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.code = errors[0]?.code ?? 'UNKNOWN'
    this.errors = errors
    this.requestId = requestId
  }

  /** Errors that name a field, for setError() on a form. */
  get fieldErrors(): Array<Required<Pick<ApiFieldError, 'field'>> & ApiFieldError> {
    return this.errors.filter(
      (e): e is ApiFieldError & { field: string } => typeof e.field === 'string',
    )
  }

  /** Errors with no field, for a form-level banner. */
  get formErrors(): ApiFieldError[] {
    return this.errors.filter((e) => !e.field)
  }

  get isConflict(): boolean {
    return this.status === 409
  }

  /** A stale If-Match. Drives the conflict dialog rather than a toast. */
  get isStaleVersion(): boolean {
    return this.status === 412
  }

  get isForbidden(): boolean {
    return this.status === 403
  }

  get isNotFound(): boolean {
    return this.status === 404
  }

  get isValidation(): boolean {
    return this.status === 422
  }
}

/**
 * Whether this runtime's fetch accepts the AbortSignal we can construct.
 *
 * Under jsdom the AbortSignal comes from the jsdom realm while fetch is Node's
 * undici, and undici rejects the cross-realm signal outright. Browsers have no
 * such split. Detected once so request cancellation - which matters for
 * debounced search (§28) - is kept everywhere it actually works, and dropped
 * only where it cannot.
 */
const SIGNAL_SUPPORTED = (() => {
  try {
    const controller = new AbortController()
    new Request('http://localhost/', { signal: controller.signal })
    return true
  } catch {
    return false
  }
})()

function parseVersion(etag: string | null): number | null {
  if (!etag) return null
  const match = /v(\d+)/.exec(etag)
  return match ? Number(match[1]) : null
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Sent as If-Match. Required by the API for PATCH and DELETE. */
  version?: number
  signal?: AbortSignal
  /** Correlates a user action across client, server log and audit row. */
  requestId?: string
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const { method = 'GET', body, version, signal, requestId } = options

  const headers: Record<string, string> = { accept: 'application/json' }
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (version !== undefined) headers['if-match'] = `W/"v${version}"`
  if (requestId) headers['x-request-id'] = requestId

  const response = await fetch(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal && SIGNAL_SUPPORTED ? { signal } : {}),
    // The session cookie is the credential; nothing else authenticates a call.
    credentials: 'same-origin',
  })

  // 204 and any empty body: there is nothing to unwrap.
  const text = await response.text()
  const payload = text
    ? (JSON.parse(text) as {
        success: boolean
        data: T
        meta: ApiMeta
        errors: ApiFieldError[] | null
      })
    : null

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.errors ?? [{ code: 'UNKNOWN', message: response.statusText }],
      payload?.meta?.requestId,
    )
  }

  const etag = response.headers.get('etag')
  return {
    data: (payload?.data ?? null) as T,
    meta: payload?.meta ?? { requestId: '' },
    etag,
    version: parseVersion(etag),
  }
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body' | 'version'>) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body: unknown, version: number, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body, version }),
  // PUT is for whole-collection replacement, where an empty array is a
  // meaningful instruction rather than an omission. The only such endpoint
  // today is a quotation's charges and taxes, which the API replaces together.
  put: <T>(path: string, body: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, version: number, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE', version }),
}

/** Builds a query string, dropping empty values so the URL stays readable. */
export function queryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const s = search.toString()
  return s ? `?${s}` : ''
}
