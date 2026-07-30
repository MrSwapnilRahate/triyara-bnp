import type { ReactNode } from 'react'

import { logoutAction } from '@/auth/actions'
import { currentOrganization, requireAuth } from '@/auth/context'
import { AppChrome } from '@/components/layout/app-chrome'
import { LegacySurface } from '@/components/layout/legacy-surface'
import { SignOutButton } from '@/components/layout/sign-out-button'
import { AbilityProvider } from '@/lib/ability-context'

/**
 * Authenticated shell (TRY-BNP-PORTAL-01 §3).
 *
 * A Server Component: it resolves the session and the organization, then hands
 * the client chrome the minimum it needs. Roles are passed rather than a
 * serialised ability object, so the client rebuilds the rules from the single
 * definition in @triyara/auth and cannot drift from the server.
 *
 * Sign-out is rendered here as a form so it can invoke the server action; the
 * design-system UserMenu takes it as an opaque slot.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireAuth()
  const org = await currentOrganization()

  return (
    <AbilityProvider roles={ctx.user.roles}>
      <AppChrome
        user={{ name: ctx.user.name, email: ctx.user.email, roles: ctx.user.roles }}
        organization={{
          id: ctx.organizationId,
          name: org?.name ?? 'Organization',
          ...(org?.slug ? { hint: org.slug } : {}),
        }}
        signOutSlot={
          <form action={logoutAction}>
            <SignOutButton />
          </form>
        }
      >
        {/* Every page under (app) predates the design system and hard-codes the
            old palette. See LegacySurface for when this wrapper comes off. */}
        <LegacySurface>{children}</LegacySurface>
      </AppChrome>
    </AbilityProvider>
  )
}
