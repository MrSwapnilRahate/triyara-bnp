'use client'

import { Badge } from '@triyara/ui'

import type { RoleName, UserStatus } from '../types'

// Shared presentation for the user administration screens. One place, so the
// list and the detail tabs cannot disagree about what a status colour means.

export const StatusTone: Record<UserStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  ACTIVE: 'success',
  INVITED: 'warning',
  SUSPENDED: 'danger',
  DEACTIVATED: 'neutral',
}

/**
 * ADMIN is the only role that carries real risk, so it is the only one tinted.
 * Colouring all four would make the table louder without making it clearer.
 */
const RoleTone: Record<RoleName, 'accent' | 'neutral'> = {
  ADMIN: 'accent',
  EXPORT_MANAGER: 'neutral',
  VERIFIER: 'neutral',
  READ_ONLY: 'neutral',
}

const ROLE_LABELS: Record<RoleName, string> = {
  ADMIN: 'Admin',
  EXPORT_MANAGER: 'Export manager',
  VERIFIER: 'Verifier',
  READ_ONLY: 'Read only',
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role as RoleName] ?? role
}

export function RoleBadges({ roles }: { roles: RoleName[] }) {
  if (roles.length === 0) {
    // Not an empty cell: "no roles" is a real and notable state - the person
    // can sign in and see nothing.
    return <span className="text-xs text-content-subtle">No roles</span>
  }
  return (
    <span className="flex flex-wrap gap-gap-xs">
      {roles.map((role) => (
        <Badge key={role} size="sm" tone={RoleTone[role] ?? 'neutral'}>
          {roleLabel(role)}
        </Badge>
      ))}
    </span>
  )
}

/** Absolute, not relative: "3 months ago" is useless in a security review. */
export function formatWhen(value: string | null | undefined): string {
  if (!value) return 'Never'
  return new Date(value).toLocaleString()
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString()
}

/**
 * A user agent string, shortened to the part a person reading a security log
 * actually uses. The full string stays available as a title.
 */
export function describeAgent(userAgent: string | null): { browser: string; device: string } {
  if (!userAgent) return { browser: 'Unknown', device: 'Unknown' }

  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : /Firefox\//.test(userAgent)
            ? 'Firefox'
            : 'Unknown'

  const device = /iPhone|iPad|iPod/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Macintosh|Mac OS X/.test(userAgent)
        ? 'macOS'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'Unknown'

  return { browser, device }
}
