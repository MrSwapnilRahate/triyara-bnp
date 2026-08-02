import type { Metadata } from 'next'

import { RegistrationWizard } from '@/features/supplier-registration/components/registration-wizard'

export const metadata: Metadata = {
  title: 'Register as a supplier · Triyara Exports',
  description:
    'Register your company with Triyara Exports. Tell us what you supply and our verification team will review your application.',
}

// Public, unauthenticated. Listed in PUBLIC_PATHS so middleware does not send a
// supplier who has never met us to the login page.
export default function SupplierRegistrationPage() {
  return <RegistrationWizard />
}
