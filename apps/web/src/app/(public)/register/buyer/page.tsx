import type { Metadata } from 'next'

import { BuyerRegistrationWizard } from '@/features/buyer-registration/components/buyer-wizard'

export const metadata: Metadata = {
  title: 'Send us your requirement · Triyara Exports',
  description:
    'Tell Triyara Exports what you are looking to buy. Our team reviews every enquiry and comes back with what we can source.',
}

// Public, unauthenticated. Listed in PUBLIC_PATHS so middleware does not send a
// buyer who has never met us to the login page.
export default function BuyerRegistrationPage() {
  return <BuyerRegistrationWizard />
}
