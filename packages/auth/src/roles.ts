// Mirrors the Prisma RoleName enum in @triyara/db.
//
// The first four are internal staff. EXTERNAL_PARTY is an authenticated Buyer or
// Supplier and holds NO abilities - `buildAbilityFor` has no branch for it, and
// it is absent from ASSIGNABLE_ROLES and GRANTABLE_ROLES in @triyara/validation,
// so no administrator can grant it through the UI. Which party an external user
// actually is comes from their Account, not from a second role.
export const ROLES = ['ADMIN', 'EXPORTER', 'VERIFIER', 'READ_ONLY', 'EXTERNAL_PARTY'] as const
export type Role = (typeof ROLES)[number]

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value)
}
