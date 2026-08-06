import type { ReactNode } from 'react'

import { LegacySurface } from '@/components/layout/legacy-surface'

/**
 * Pins this pre-portal route to the dark palette.
 *
 * Wave 1 put this wrapper on the shared (app) layout as a stopgap. Wave 2 adds
 * the first token-styled screens under (app), so it has moved down onto the
 * legacy routes only - otherwise Products and Suppliers would inherit the pin
 * and light mode would not work for them.
 *
 * Delete this file when documents is restyled onto the design system (§30 Wave 7).
 */
export default function LegacyLayout({ children }: { children: ReactNode }) {
  return <LegacySurface>{children}</LegacySurface>
}
