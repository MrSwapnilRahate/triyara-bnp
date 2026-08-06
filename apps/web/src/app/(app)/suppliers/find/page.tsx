import type { Metadata } from 'next'

import { MatchingDashboard } from '@/features/supplier-matching/components/matching-dashboard'

export const metadata: Metadata = {
  title: 'Find suppliers · Triyara BNP',
  description: 'Filter and rank verified suppliers against a buyer requirement.',
}

export default function FindSuppliersPage() {
  return <MatchingDashboard />
}
