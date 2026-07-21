// The four V1 roles (mirrors the Prisma RoleName enum in @triyara/db).
export const ROLES = ['ADMIN', 'EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY'] as const
export type Role = (typeof ROLES)[number]

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value)
}
