import type { Metadata } from 'next'

import { requireAuth } from '@/auth/context'
import { RequirementForm } from '@/features/portal/components/requirement-form'
import { portalContextService } from '@/lib/portal-context-service'

export const metadata: Metadata = { title: 'New requirement · Triyara BNP' }

// Resolved per request: an account that is blocked, deleted or moved between
// tenants must stop working on the next request rather than at session expiry.
export const dynamic = 'force-dynamic'

/**
 * Where a buyer writes a new requirement.
 *
 * `resolve` runs here even though the page renders nothing from it. Without it
 * the form would be reachable by anyone with a session - a supplier, an account
 * awaiting approval, staff - and they would only discover they could not use it
 * after filling it in and pressing submit. Refusing at the door is both safer
 * and kinder, and the action resolves the party again on its own account rather
 * than trusting that this ran.
 */
export default async function Page() {
  const auth = await requireAuth()
  await portalContextService.resolve(auth)

  return <RequirementForm />
}
