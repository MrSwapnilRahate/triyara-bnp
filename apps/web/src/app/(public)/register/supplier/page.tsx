import type { Metadata } from 'next'

import { BackToMarketingSite } from '@/components/back-to-marketing-site'
import { RegistrationWizard } from '@/features/supplier-registration/components/registration-wizard'

export const metadata: Metadata = {
  title: 'Register as a supplier · Triyara Exports',
  description:
    'Register your company with Triyara Exports. Tell us what you supply and our verification team will review your application.',
}

// Public, unauthenticated. Listed in PUBLIC_PATHS so middleware does not send a
// supplier who has never met us to the login page.
export default function SupplierRegistrationPage() {
  return (
    <>
      {/* Most people arriving here came from the marketing site. Giving them a
          way back costs one line and is the difference between leaving to read
          more and leaving for good. */}
      <div className="mx-auto w-full max-w-3xl px-gutter pt-gutter">
        <BackToMarketingSite />
      </div>
      <RegistrationWizard />
    </>
  )
}
