import Link from 'next/link'

import { COMPANY, CONTACT } from '../content'

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-white/10 bg-navy-deep py-section">
      <div className="mx-auto flex max-w-5xl flex-col gap-gutter px-gutter sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.12em] text-white">TRIYARA</p>
          <p className="mt-gap-xs text-xs text-white/50">
            {COMPANY.legalName} · © {year}
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center gap-gutter text-sm">
            <li>
              <Link
                className="focus-ring text-white/70 underline-offset-4 hover:text-white hover:underline"
                href="/privacy"
              >
                Privacy
              </Link>
            </li>
            <li>
              <Link
                className="focus-ring text-white/70 underline-offset-4 hover:text-white hover:underline"
                href="/terms"
              >
                Terms
              </Link>
            </li>
            <li>
              <a
                className="focus-ring text-white/70 underline-offset-4 hover:text-white hover:underline"
                href={`mailto:${CONTACT.email}`}
              >
                Contact
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  )
}
