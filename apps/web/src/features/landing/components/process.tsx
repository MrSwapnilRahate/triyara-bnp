import { BUYER_JOURNEY, PROCESS, SUPPLIER_JOURNEY } from '../content'

/**
 * The two journeys, side by side.
 *
 * Ordered lists rather than arrow graphics: the order is the meaning, and a
 * screen reader announces "3 of 5" without needing alt text for a chevron.
 *
 * The step numbers were circles - a bordered pill per row, which is a lot of
 * shape for a digit. They are set in the mono face now, at the size the
 * verification panel uses for certificate codes, so a number reads as a
 * reference mark rather than a badge. The rows are separated by hairlines: a
 * numbered schedule, which is what this is.
 */
function Journey({
  label,
  title,
  steps,
}: {
  label: string
  title: string
  steps: readonly { title: string; body: string }[]
}) {
  return (
    <div>
      {/* The same mark the hero opens on: a short gold rule and a sentence.
          Gold is identity, so it appears where the page names who something is
          for - and nowhere else in this section. */}
      <div aria-hidden="true" className="h-0.5 w-7 bg-brand" />
      <h3 className="mt-gap text-base text-content-muted">{label}</h3>
      <p className="mt-gap-xs text-md font-semibold tracking-tight text-content">{title}</p>

      <ol className="mt-gutter border-t border-line">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-gap-lg border-b border-line py-gap-lg">
            <span
              aria-hidden="true"
              className="w-8 shrink-0 font-mono text-2xs tabular-nums tracking-wider text-content-muted"
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <div>
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
        <h2 id="how-it-works" className="font-serif text-xl font-semibold text-content sm:text-2xl">
          {PROCESS.heading}
        </h2>
        <p className="mt-gap-lg max-w-3xl text-balance text-md leading-relaxed text-content-muted">
          {PROCESS.body}
        </p>

        {/* Symmetric on purpose. Neither side of the trade leads here - the
            hero already made that choice, and repeating it would say the
            journeys are unequal, which they are not. */}
        <div className="mt-section-lg grid gap-section-lg md:grid-cols-2">
          <Journey
            label={PROCESS.supplier.label}
            title={PROCESS.supplier.title}
            steps={SUPPLIER_JOURNEY}
          />
          <Journey label={PROCESS.buyer.label} title={PROCESS.buyer.title} steps={BUYER_JOURNEY} />
        </div>
      </div>
    </section>
  )
}
