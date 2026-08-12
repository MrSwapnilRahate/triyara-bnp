import type { Metadata } from 'next'

import { BackToMarketingSite } from '@/components/back-to-marketing-site'
import { BuyerRegistrationWizard } from '@/features/buyer-registration/components/buyer-wizard'

export const metadata: Metadata = {
  title: 'Send us your requirement · Triyara Exports',
  description:
    'Tell Triyara Exports what you are looking to buy. Our team reviews every enquiry and comes back with what we can source.',
}

// Public, unauthenticated. Listed in PUBLIC_PATHS so middleware does not send a
// buyer who has never met us to the login page.
export default function BuyerRegistrationPage() {
  return (
    <>
      {/* Same reasoning as the supplier form: this is an entry point from the
          marketing site, so it needs a way back to it. */}
      <div className="mx-auto w-full max-w-3xl px-gutter pt-gutter">
        <BackToMarketingSite />
      </div>
      <BuyerRegistrationWizard />
    </>
  )
}
