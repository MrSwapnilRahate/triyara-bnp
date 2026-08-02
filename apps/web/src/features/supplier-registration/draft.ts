'use client'

import type { RegistrationDraft } from './types'

// Draft persistence for the public registration form (TRY-BNP-SUPPLIER-REG).
//
// Deliberately localStorage rather than a server-side draft store. The
// registrant has no account, so a server draft would need its own anonymous
// token, its own endpoints and its own expiry — a second unauthenticated write
// surface, built to solve a problem the browser already solves. The cost is
// that a draft does not follow someone to another device, which is the right
// trade for a form filled in one sitting.

const KEY = 'triyara.supplier-registration.draft.v1'

/** Drafts older than this are stale enough that resuming would confuse. */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

interface StoredDraft {
  savedAt: number
  data: RegistrationDraft
}

export function loadDraft(): RegistrationDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDraft
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(KEY)
      return null
    }
    return parsed.data
  } catch {
    // A corrupted or unreadable draft must never block the form. Private
    // browsing can throw on read as well as write.
    return null
  }
}

export function saveDraft(data: RegistrationDraft): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), data }))
  } catch {
    // Quota exceeded, or storage disabled. Losing auto-save is a degradation,
    // not a failure — the form still submits.
  }
}

export function clearDraft(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* nothing to do */
  }
}
