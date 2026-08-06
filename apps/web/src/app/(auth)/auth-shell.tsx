import { AuthLayout, cn } from '@triyara/ui'
import type { ReactNode } from 'react'

import { Brand } from '@/components/layout/brand'

/**
 * Unauthenticated shell, now on the design system.
 *
 * The public API is unchanged (title, subtitle, children, inputClass,
 * buttonClass), so the three existing auth pages are restyled without being
 * touched. That is the point of keeping the seam here.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <AuthLayout brand={<Brand href="" />} title={title} description={subtitle}>
      {children}
    </AuthLayout>
  )
}

/** Field and button classes for the existing auth forms. */
export const inputClass = cn(
  'focus-ring h-9 w-full rounded-sm border border-line bg-surface px-2.5 text-base text-content',
  'placeholder:text-content-subtle hover:border-line-strong',
  'aria-[invalid=true]:border-danger',
)

export const buttonClass = cn(
  'focus-ring inline-flex h-9 w-full items-center justify-center rounded-sm',
  'bg-accent px-4 text-base font-medium text-accent-fg',
  'transition-colors duration-fast hover:bg-accent-hover active:bg-accent-active',
  'disabled:pointer-events-none disabled:opacity-50',
)
