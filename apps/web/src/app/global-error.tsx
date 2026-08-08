'use client'

import './globals.css'

import { useEffect } from 'react'

import { reportClientError } from '@/lib/report-client-error'

/**
 * The boundary of last resort.
 *
 * There were fourteen route-level `error.tsx` files and no root one, so a
 * failure in the root layout - the theme provider, the query client, the font
 * loader - had nothing to catch it and the user got the framework's unstyled
 * default. This replaces the whole document when that happens, which is why it
 * carries its own `<html>` and `<body>`: at this point the layout that would
 * normally supply them is the thing that failed.
 *
 * Kept deliberately plain. Anything imported from the design system is code
 * that could be the reason we are here.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => reportClientError(error), [error])

  return (
    <html lang="en" data-theme="dark">
      <body className="bg-canvas text-content antialiased">
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-gap px-gutter text-center">
          <h1 className="text-md font-semibold tracking-tight">Something went wrong</h1>
          <p className="text-base leading-relaxed text-content-muted">
            The page could not be displayed. Our team has been notified.
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-line px-gap py-gap-xs text-base font-medium hover:bg-surface"
          >
            Try again
          </button>
          {/* The digest is what ties what the user saw to the server-side
              report. Without it they can only describe the page. */}
          {error.digest ? (
            <p className="font-mono text-2xs text-content-subtle">Reference {error.digest}</p>
          ) : null}
        </main>
      </body>
    </html>
  )
}
