import { BUYER_JOURNEY, SUPPLIER_JOURNEY } from '../content'

/**
 * The two journeys, side by side.
 *
 * Numbered ordered lists rather than arrow graphics: the order is the meaning,
 * and a screen reader announces "3 of 5" without needing alt text for a chevron.
 * The connecting line is decorative and hidden from assistive technology.
 */
function Journey({
  title,
  audience,
  steps,
}: {
  title: string
  audience: string
  steps: readonly { title: string; body: string }[]
}) {
  return (
    <div>
      <h3 className="text-2xs font-semibold uppercase tracking-[0.18em] text-accent">{audience}</h3>
      <p className="mt-gap-xs text-md font-semibold tracking-tight text-content">{title}</p>
      <ol className="mt-gutter space-y-gutter">
        {steps.map((step, index) => (
          <li key={step.title} className="relative flex gap-gap-lg">
            <div className="flex flex-col items-center">
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface-raised text-xs font-semibold tabular-nums text-content"
              >
                {index + 1}
              </span>
              {index < steps.length - 1 ? (
                <span aria-hidden="true" className="mt-gap-xs w-px flex-1 bg-line" />
              ) : null}
            </div>
            <div className="pb-gap-lg">
              <p className="text-base font-medium text-content">{step.title}</p>
              <p className="mt-gap-xs text-sm leading-relaxed text-content-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function Process() {
  return (
    <section aria-labelledby="how-it-works" className="bg-surface py-section-lg">
      <div className="mx-auto max-w-5xl px-gutter">
        <h2
          id="how-it-works"
          className="text-lg font-semibold tracking-tight text-content sm:text-xl"
        >
          How it works
        </h2>
        <p className="mt-gap-lg max-w-2xl text-base leading-relaxed text-content-muted">
          Two paths into the same network. Whichever side you are on, the first step is the same
          form.
        </p>
        <div className="mt-section-lg grid gap-section-lg md:grid-cols-2">
          <Journey
            audience="For suppliers"
            title="From registration to orders"
            steps={SUPPLIER_JOURNEY}
          />
          <Journey
            audience="For buyers"
            title="From requirement to shipment"
            steps={BUYER_JOURNEY}
          />
        </div>
      </div>
    </section>
  )
}
