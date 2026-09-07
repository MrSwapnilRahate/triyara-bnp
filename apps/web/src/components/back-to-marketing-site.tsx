import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

/**
 * Way back to the public site from the public intake forms.
 *
 * These two pages are the only ones a stranger reaches directly, and until this
 * existed they had nothing but the browser back button if they wanted to read
 * about the company before applying.
 *
 * It used to point at https://www.triyaraexports.com, and the plain anchor was
 * deliberate because that was a different origin and a different deployment.
 * `/` is now the complete marketing site in this app, so the destination is a
 * route of our own - which is also why this is `next/link` again: there is a
 * client-side route to prefetch, and `rel="noopener"` guarded against a
 * cross-origin hazard that no longer exists.
 */
export function BackToMarketingSite() {
  return (
    <Link
      href="/"
      className="focus-ring inline-flex items-center gap-gap-xs rounded-xs text-2xs text-content-muted transition-colors duration-fast hover:text-content"
    >
      <ArrowLeft aria-hidden="true" className="size-3.5" />
      Back to TRIYARA EXPORTS
    </Link>
  )
}
