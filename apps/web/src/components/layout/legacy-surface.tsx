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
 * WHERE IT IS APPLIED: one `layout.tsx` per legacy route segment - dashboard,
 * accounts, activity, documents, notifications, verifications. It is NOT on the
 * shared `(app)` layout, because the token-styled screens added from Wave 2
 * onwards must not inherit the pin.
 *
 * WHEN TO DELETE: remove a route's layout.tsx as that route is restyled, and
 * delete this component once the last one is migrated (§30 Wave 7).
 */
export function LegacySurface({ children }: { children: ReactNode }) {
  return (
    <div data-theme="dark" className="min-h-full bg-canvas text-content">
      {children}
    </div>
  )
}
