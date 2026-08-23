import type { Metadata } from 'next'

import { QuoteRequestList } from '@/features/quote-requests/components/quote-request-list'

export const metadata: Metadata = { title: 'Website enquiries · Triyara BNP' }

export default function Page() {
  return <QuoteRequestList />
}
