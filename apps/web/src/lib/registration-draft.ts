'use client'

// Draft persistence for the public registration forms (supplier and buyer).
//
// Deliberately localStorage rather than a server-side draft store. The
// registrant has no account, so a server draft would need its own anonymous
// token, its own endpoints and its own expiry — a second unauthenticated write
// surface, built to solve a problem the browser already solves. The cost is
// that a draft does not follow someone to another device, which is the right
// trade for a form filled in one sitting.
//
// Shared rather than copied per form: the storage key is the only thing that
// differs, and two copies of "what happens when localStorage throws" is two
// places to get it wrong.

/** Drafts older than this are stale enough that resuming would confuse. */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

interface StoredDraft<T> {
  savedAt: number
  data: T
}

export interface DraftStore<T> {
  load(): T | null
  save(data: T): void
  clear(): void
}

/**
 * A draft store bound to one storage key.
 *
 * Every operation swallows its errors. Private browsing can throw on read as
 * well as write, and a quota failure must degrade auto-save rather than break
 * the form — losing the convenience is survivable, losing the submission is
 * not.
 */
export function createDraftStore<T>(key: string): DraftStore<T> {
  return {
    load(): T | null {
      if (typeof window === 'undefined') return null
      try {
        const raw = window.localStorage.getItem(key)
        if (!raw) return null
        const parsed = JSON.parse(raw) as StoredDraft<T>
        if (!parsed?.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) {
          window.localStorage.removeItem(key)
          return null
        }
        return parsed.data
      } catch {
        return null
      }
    },

    save(data: T): void {
      if (typeof window === 'undefined') return
      try {
        window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }))
      } catch {
        /* quota exceeded, or storage disabled */
      }
    },

    clear(): void {
      if (typeof window === 'undefined') return
      try {
        window.localStorage.removeItem(key)
      } catch {
        /* nothing to do */
      }
    },
  }
}
