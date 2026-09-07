import Link from 'next/link'

import { COMPANY, CONTACT } from '../content'

/**
 * The quiet close.
 *
 * Was set on the legacy `navy-deep` with white at various opacities, which are
 * fixed values: measured against the themed canvas the footer came out at
 * 17.7:1 in light and 1.04:1 in dark, where it was indistinguishable from the
 * page behind it. On semantic tokens it is a footer in both.
 *
 * The links stay in this file rather than moving to content.ts. They are
 * navigation bound to routes, not copy the business rewrites - the same
 * reasoning that keeps `LINKS` inside SiteHeader.
 */
const LINKS = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: `mailto:${CONTACT.email}`, label: 'Contact' },
] as const

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-line bg-surface-sunken py-section">
      <div className="mx-auto flex max-w-5xl flex-col gap-gutter px-gutter sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.12em] text-content">TRIYARA</p>
          <p className="mt-gap-xs text-xs text-content-muted">
            {COMPANY.legalName} · © {year}
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center gap-gutter text-sm">
            {LINKS.map((link) =>
              link.href.startsWith('mailto:') ? (
                <li key={link.href}>
                  <a
                    className="focus-ring rounded-sm text-content-muted underline-offset-4 transition-colors duration-fast hover:text-content hover:underline"
                    href={link.href}
                  >
                    {link.label}
                  </a>
                </li>
              ) : (
                <li key={link.href}>
                  <Link
                    className="focus-ring rounded-sm text-content-muted underline-offset-4 transition-colors duration-fast hover:text-content hover:underline"
                    href={link.href}
                  >
                    {link.label}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </nav>
      </div>
    </footer>
  )
}
