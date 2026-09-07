import { AuthLayout, Label } from '@triyara/ui'
import type { ReactNode } from 'react'

import { Brand } from '@/components/layout/brand'

/**
 * Unauthenticated shell.
 *
 * `inputClass` and `buttonClass` used to live here - two hand-rolled class
 * strings duplicating what `Input` and `Button` already are. They were the
 * reason the auth fields drifted from the rest of the product: a copy of a
 * component does not receive the component's fixes. The pages use the
 * primitives directly now, and the shell is only a shell.
 *
 * `footer` is passed through so a page can put its way out - forgot password,
 * back to sign in, how to register - underneath the form rather than inside it.
 */
export function AuthShell({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string
  subtitle?: string
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <AuthLayout
      brand={<Brand href="" size="lg" />}
      title={title}
      description={subtitle}
      footer={footer}
    >
      {children}
    </AuthLayout>
  )
}

/**
 * A label and its control.
 *
 * The three auth forms had no labels at all - the placeholder was the only name
 * a field ever had, so it vanished at the first keystroke and a screen reader
 * got an inconsistent one. The placeholders are still here, verbatim: the
 * end-to-end suite drives these forms through `getByPlaceholder`, and they are
 * a useful hint besides. They are now a hint next to a label rather than a
 * substitute for one.
 */
export function AuthField({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: ReactNode
}) {
  return (
    <div className="space-y-gap-xs">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

/**
 * The one message these forms can return.
 *
 * Every server action here answers with a single string for the whole form, not
 * per field - "Invalid email or password" deliberately does not say which was
 * wrong, and the forgot-password reply is identical whether or not the address
 * exists. So this is one region, referenced by every input's
 * `aria-describedby`, rather than an error hung off a particular control.
 *
 * `tone` picks the role, and the distinction matters: an assistive technology
 * should interrupt for a failure and not for "check your email".
 */
export function AuthMessage({
  id,
  children,
  tone = 'danger',
}: {
  id: string
  children: ReactNode
  tone?: 'danger' | 'neutral'
}) {
  return (
    <p
      className={tone === 'danger' ? 'text-sm text-danger' : 'text-sm text-content-muted'}
      id={id}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      {children}
    </p>
  )
}

/**
 * Footnote links under the card.
 *
 * A shared class rather than a component: `next/link` stays visible at each call
 * site, and there is no Link primitive in the design system to duplicate. What
 * this replaces is `text-white/40`, which measured 1.00:1 on the light card -
 * white text on a white surface. The only way out of a failed sign-in was
 * invisible.
 */
export const authLinkClass =
  'focus-ring rounded-xs text-content-muted underline underline-offset-4 transition-colors duration-fast hover:text-content'
