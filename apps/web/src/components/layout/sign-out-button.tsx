'use client'

import { cn } from '@triyara/ui'
import { LogOut } from 'lucide-react'
import { useFormStatus } from 'react-dom'

/**
 * Submit button for the sign-out form. A client component so it can read the
 * form's pending state - a sign-out that gives no feedback gets double-clicked.
 */
export function SignOutButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'focus-ring flex w-full items-center gap-gap rounded-sm px-2 py-1.5 text-base',
        'text-danger transition-colors duration-instant',
        'hover:bg-danger-subtle disabled:opacity-60',
        '[&_svg]:size-4',
      )}
    >
      <LogOut aria-hidden="true" />
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
