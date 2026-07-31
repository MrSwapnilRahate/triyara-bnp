'use client'

import { useEffect } from 'react'

/**
 * Warns before a full page unload while a form has unsaved changes.
 *
 * Deliberately limited to `beforeunload`. Next's App Router gives no supported
 * way to intercept a client-side route change, and the workarounds that exist -
 * patching history, hijacking every Link - break the back button in ways that
 * are worse than the problem. Client navigation is instead guarded by the
 * screens themselves: the visible "unsaved changes" note and an explicit Cancel
 * that the user has to choose.
 */
export function useDirtyGuard(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Required by Chrome; the string itself is never displayed.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [enabled])
}
