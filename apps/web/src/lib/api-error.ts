import type { useToast } from '@triyara/ui'

import { ApiError } from './api-client'

/**
 * The §20 status-to-outcome table, in one place.
 *
 * Every screen reports failures through this, so a 409 reads the same in the
 * product editor and the supplier editor. The server's message is shown
 * verbatim for 409 and 422 because it names the actual constraint - it is more
 * accurate than anything the client could reconstruct.
 */
export function describeApiError(error: unknown): {
  title: string
  description?: string
  requestId?: string
  /** True when the caller should open a conflict dialog rather than toast. */
  staleVersion: boolean
} {
  if (!(error instanceof ApiError)) {
    return {
      title: 'Something went wrong',
      description: error instanceof Error ? error.message : undefined,
      staleVersion: false,
    }
  }

  const base = { requestId: error.requestId, staleVersion: error.isStaleVersion }

  switch (error.status) {
    case 401:
      return { ...base, title: 'Your session has ended', description: 'Sign in again to continue.' }
    case 403:
      return {
        ...base,
        title: 'You do not have permission',
        description: 'Ask an administrator if you need access.',
      }
    case 404:
      // The API answers 404 for another tenant's record too, deliberately. The
      // UI must not imply the record exists somewhere the user cannot see.
      return { ...base, title: 'Not found', description: 'This record no longer exists.' }
    case 409:
      return { ...base, title: 'Conflict', description: error.message }
    case 412:
      return {
        ...base,
        title: 'This record changed while you were editing',
        description: 'Reload to see the current version, then try again.',
      }
    case 422:
      return { ...base, title: 'Check the highlighted fields', description: error.message }
    case 428:
      // A missing If-Match is a client bug, not something the user did.
      return { ...base, title: 'Could not save', description: 'Reload the page and try again.' }
    case 429:
      return { ...base, title: 'Too many requests', description: 'Wait a moment and try again.' }
    default:
      return { ...base, title: 'Server error', description: error.message }
  }
}

type Toast = ReturnType<typeof useToast>

/** Reports a failure as a toast. Returns true if it was a stale-version case. */
export function toastApiError(toast: Toast, error: unknown): boolean {
  const described = describeApiError(error)
  toast.error(described.title, {
    ...(described.description ? { description: described.description } : {}),
    ...(described.requestId ? { requestId: described.requestId } : {}),
  })
  return described.staleVersion
}
