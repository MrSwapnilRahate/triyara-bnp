'use client'

import { OrganizationSwitcher } from '@triyara/ui'

/**
 * Renders the current organization. UI only, per the architecture: the session
 * is single-tenant and there is no endpoint to switch, so passing a list of one
 * makes this a static label rather than a menu that appears to work.
 */
export function OrganizationBadge({
  organization,
}: {
  organization: { id: string; name: string; hint?: string }
}) {
  return <OrganizationSwitcher current={organization} className="min-w-0 flex-1" />
}
