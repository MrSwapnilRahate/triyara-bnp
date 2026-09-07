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
 *
 * Task-led, not brand-led. Signing in is something a person is trying to finish,
 * so this stays one narrow column: no second column, no marketing panel, no
 * illustration. What it borrows from the public site is the identity - the gold
 * rule and the display face on the page title - and nothing else.
 *
 * TOP-ALIGNED RATHER THAN CENTRED. The card used to sit dead-centre of the
 * viewport, which put the first field at y=430 of 900 on a laptop: a small panel
 * floating in an empty field, which is the single most recognisable shape of a
 * template login page. Aligned to the top of the measure it reads as a document
 * you have been handed, and on a phone - where centring never applied anyway -
 * nothing changes.
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
        'ds-root bg-canvas px-gap-lg py-section-lg flex min-h-screen flex-col',
        className,
      )}
    >
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-section flex justify-center">{brand}</div>

        {/* A document, not a card: one hairline, no shadow, `md` radius. The
            shadow it used to carry was the only elevation on a page with
            nothing to elevate above. */}
        <div className="border-line bg-surface p-section rounded-md border">
          {/* The same mark the public site opens on. Gold is identity here too,
              and it is the only place gold appears on this screen. */}
          <div aria-hidden="true" className="bg-brand h-0.5 w-7" />
          <h1 className="text-content mt-gap-lg font-serif text-xl font-semibold">{title}</h1>
          {description ? (
            <p className="mt-gap-xs text-content-muted text-base">{description}</p>
          ) : null}
          <div className="mt-gutter">{children}</div>
        </div>

        {/* Plain links, deliberately not wrapped in a landmark: this is a
            footnote under a form, and a `nav` here would announce a second
            navigation region on a page whose whole point is that it has none. */}
        {footer ? (
          <div className="mt-gutter text-content-muted space-y-gap text-center text-xs">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
