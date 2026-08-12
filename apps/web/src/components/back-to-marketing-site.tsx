import { ArrowLeft } from 'lucide-react'

/**
 * Way back to the public site from the public intake forms.
 *
 * These two pages are the only ones a stranger reaches directly - they arrive
 * from triyaraexports.com and, until this existed, had nothing but the browser
 * back button if they wanted to read about the company before applying.
 *
 * A plain anchor, not `next/link`: the marketing site is a different origin and
 * a different deployment, so there is no client-side route to prefetch.
 */
export function BackToMarketingSite() {
  return (
    <a
      href="https://www.triyaraexports.com"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-gap-xs text-2xs text-content-subtle transition-colors hover:text-content-muted"
    >
      <ArrowLeft aria-hidden="true" className="size-3.5" />
      Back to TRIYARA EXPORTS
    </a>
  )
}
