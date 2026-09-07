import { WHY, WHY_SECTION } from '../content'

/**
 * Six reasons, set as a document rather than a product grid.
 *
 * This was six bordered cards in a 3x2 grid, each with a blue Lucide icon above
 * a bold title above grey body copy - the single most reproduced layout on the
 * web, and the clearest signal that a page was assembled rather than written.
 * The icons carried no information: a shield next to "Quality verification"
 * tells a buyer nothing the sentence underneath does not, and the cards also
 * had a hover border, an affordance on something you cannot click.
 *
 * What replaced them is the shape the content already had - a reason and its
 * explanation, six times - so each row is a heading against its paragraph,
 * separated by a hairline. Nothing is grouped or ranked: these are six
 * independent claims, and inventing categories for them would be inventing a
 * taxonomy the business has not agreed.
 *
 * The title column is narrow so the reasons stack into a readable left edge
 * and the explanations share one measure, which is what makes it scan as a
 * list of reasons rather than six paragraphs.
 */
export function Why() {
  return (
    <section
      aria-labelledby="why-triyara"
      className="border-t border-line bg-surface py-section-lg"
    >
      <div className="mx-auto max-w-5xl px-gutter">
        <h2 id="why-triyara" className="font-serif text-xl font-semibold text-content sm:text-2xl">
          {WHY_SECTION.heading}
        </h2>

        <ul className="mt-section border-t border-line">
          {WHY.map((item) => (
            <li
              key={item.title}
              className="grid gap-gap-xs border-b border-line py-gutter md:grid-cols-12 md:gap-gutter"
            >
              <h3 className="text-base font-semibold text-content md:col-span-4">{item.title}</h3>
              <p className="text-base leading-relaxed text-content-muted md:col-span-8">
                {item.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
