import type { Metadata } from 'next'

import { Contact } from '@/features/landing/components/contact'
import { Faq } from '@/features/landing/components/faq'
import { Hero } from '@/features/landing/components/hero'
import { Process } from '@/features/landing/components/process'
import { RegisterCta } from '@/features/landing/components/register-cta'
import { SiteFooter } from '@/features/landing/components/site-footer'
import { Why } from '@/features/landing/components/why'

export const metadata: Metadata = {
  title: 'TRIYARA Business Network · Verified Indian suppliers for global buyers',
  description:
    'TRIYARA verifies export-ready Indian suppliers and matches them with global buyers. Register as a supplier or buyer in about two minutes.',
}

/**
 * Public landing page.
 *
 * Server-rendered throughout except the FAQ, which needs interactivity — so the
 * headline, both calls to action and the whole story reach a visitor (and a
 * crawler) without waiting on JavaScript.
 */
export default function HomePage() {
  return (
    <main>
      <Hero />
      <Process />
      <Why />
      <RegisterCta />
      <Faq />
      <Contact />
      <SiteFooter />
    </main>
  )
}
