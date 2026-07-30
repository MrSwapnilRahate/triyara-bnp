import type { ReactNode } from 'react'

/**
 * Pins pre-portal pages to the dark palette.
 *
 * WHY THIS EXISTS: the pages that predate the design system (dashboard,
 * accounts, activity, documents, notifications, verifications - 20 files) style
 * themselves with the legacy marketing palette: `text-white`, `bg-navy-*`,
 * `text-gold`. Those are hard-coded, not token-driven, so on a light canvas they
 * render white-on-white and become unreadable.
 *
 * Wave 1 introduced the theme toggle, so Wave 1 owns not shipping a toggle that
 * visibly breaks the only pages that exist. Restyling those pages is Wave 7
 * (TRY-BNP-PORTAL-01 §30), so this pins them instead.
 *
 * WHEN TO DELETE: Wave 2 adds the first token-styled screens under `(app)`.
 * Those must NOT be wrapped in this. Move the wrapper down onto the individual
 * legacy pages at that point, and delete it entirely once the last one is
 * migrated.
 */
export function LegacySurface({ children }: { children: ReactNode }) {
  return (
    <div data-theme="dark" className="min-h-full bg-canvas text-content">
      {children}
    </div>
  )
}
