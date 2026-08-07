'use client'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@triyara/ui'

import { BUYER_FAQ, SUPPLIER_FAQ } from '../content'

/**
 * Supplier and buyer questions, kept apart.
 *
 * Two independent accordions rather than one mixed list: a supplier reading
 * "what does it cost" wants the supplier answer, and making them filter a
 * combined list is work we can do for them. Both allow multiple open panels —
 * these are reference answers, not a wizard.
 */
function FaqList({
  id,
  heading,
  items,
}: {
  id: string
  heading: string
  items: readonly { q: string; a: string }[]
}) {
  return (
    <div>
      <h3 id={id} className="text-2xs font-semibold uppercase tracking-[0.18em] text-accent">
        {heading}
      </h3>
      <Accordion type="multiple" className="mt-gap-lg">
        {items.map((item) => (
          <AccordionItem key={item.q} value={item.q}>
            <AccordionTrigger>{item.q}</AccordionTrigger>
            <AccordionContent>
              <p className="text-sm leading-relaxed text-content-muted">{item.a}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}

export function Faq() {
  return (
    <section aria-labelledby="faq" className="bg-surface py-section-lg">
      <div className="mx-auto max-w-5xl px-gutter">
        <h2 id="faq" className="text-lg font-semibold tracking-tight text-content sm:text-xl">
          Questions
        </h2>
        <div className="mt-section grid gap-section-lg md:grid-cols-2">
          <FaqList id="faq-suppliers" heading="For suppliers" items={SUPPLIER_FAQ} />
          <FaqList id="faq-buyers" heading="For buyers" items={BUYER_FAQ} />
        </div>
      </div>
    </section>
  )
}
