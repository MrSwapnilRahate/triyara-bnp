import { cn } from '../lib/cn'

export interface AuthLayoutProps {
  children: React.ReactNode
  /** Product name / logo lockup. */
  brand: React.ReactNode
  title: string
  description?: string
  /** Links below the card: forgot password, support. */
  footer?: React.ReactNode
  className?: string
}

/**
 * Unauthenticated shell. Deliberately chrome-free: no sidebar, no search, no
 * notifications. Nothing here should hint at the shape of the application to
 * someone who has not signed in.
 */
export function AuthLayout({
  children,
  brand,
  title,
  description,
  footer,
  className,
}: AuthLayoutProps) {
  return (
    <div
      className={cn(
        'ds-root bg-canvas px-gap-lg py-section flex min-h-screen flex-col items-center justify-center',
        className,
      )}
    >
      <div className="w-full max-w-sm">
        <div className="mb-section flex justify-center">{brand}</div>

        <div className="border-line bg-surface p-section rounded-lg border shadow-sm">
          <h1 className="text-content text-lg font-semibold">{title}</h1>
          {description ? (
            <p className="mt-gap-xs text-content-muted text-base">{description}</p>
          ) : null}
          <div className="mt-gutter">{children}</div>
        </div>

        {footer ? (
          <div className="mt-gap-lg text-content-muted text-center text-xs">{footer}</div>
        ) : null}
      </div>
    </div>
  )
}
