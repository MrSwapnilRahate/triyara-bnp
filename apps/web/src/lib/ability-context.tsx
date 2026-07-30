'use client'

import { type AppAbility, buildAbilityFor, type Role } from '@triyara/auth'
import { createContext, type ReactNode, useContext, useMemo } from 'react'

/**
 * Client-side CASL ability (TRY-BNP-PORTAL-01 §5).
 *
 * ADVISORY ONLY. It shapes the UI - which nav items appear, which buttons render
 * - and is never the enforcement point. Every screen must still behave correctly
 * when a 403 arrives, which it will: the quotation approval threshold cannot be
 * evaluated client-side because the margin it gates on is redacted from exactly
 * the roles that would need to check it.
 *
 * Built from role names rather than serialising the ability object, so there is
 * one definition of the rules (packages/auth) and no chance of the client's copy
 * drifting from the server's.
 */
const AbilityContext = createContext<AppAbility | null>(null)

export function AbilityProvider({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const ability = useMemo(() => buildAbilityFor(roles), [roles])
  return <AbilityContext.Provider value={ability}>{children}</AbilityContext.Provider>
}

export function useAbility(): AppAbility {
  const ability = useContext(AbilityContext)
  if (!ability) throw new Error('useAbility must be used inside <AbilityProvider>')
  return ability
}

/** Renders children only when the ability permits. For conditional controls. */
export function Can({
  action,
  subject,
  children,
  fallback = null,
}: {
  action: Parameters<AppAbility['can']>[0]
  subject: Parameters<AppAbility['can']>[1]
  children: ReactNode
  fallback?: ReactNode
}) {
  const ability = useAbility()
  return <>{ability.can(action, subject) ? children : fallback}</>
}
