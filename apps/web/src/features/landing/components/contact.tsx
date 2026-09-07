import { CONTACT, CONTACT_SECTION } from '../content'

/**
 * How to reach a human.
 *
 * Each channel renders only when it is actually configured. An unset WhatsApp
 * number shows nothing rather than a dead link or an invented one — a supplier
 * dialling a wrong number is worse than one fewer way to get in touch.
 *
 * That rule is exactly why the previous layout failed. Three bordered cards in
 * a three-column grid, of which only `email` is configured, rendered as one
 * card and two empty thirds - a layout that looked broken because the content
 * model said "one to three items" and the presentation assumed three. Rows on
 * a rule do not care how many there are: one reads as a contact line, three
 * read as a contact sheet.
 *
 * The icons went with them. A mail glyph beside the word "Email" is decoration
 * standing next to its own caption.
 *
 * 5/7 rather than the hero's 7/5, and no bordered panel: this is the same
 * design language, deliberately not the same composition.
 */
export function Contact({ contact = CONTACT }: { contact?: typeof CONTACT } = {}) {
  return (
    <section aria-labelledby="contact" className="bg-surface-sunken py-section-lg">
      <div className="mx-auto max-w-5xl px-gutter">
        <div className="grid gap-section lg:grid-cols-12 lg:gap-gutter">
          <div className="lg:col-span-5">
            <h2 id="contact" className="font-serif text-xl font-semibold text-content sm:text-2xl">
              {CONTACT_SECTION.heading}
            </h2>
            <p className="mt-gap-lg text-md leading-relaxed text-content-muted">
              {CONTACT_SECTION.body}
            </p>
          </div>

          <dl className="border-t border-line lg:col-span-7">
            <div className="grid gap-gap-xs border-b border-line py-gap-lg sm:grid-cols-3 sm:gap-gutter">
              <dt className="text-sm text-content-muted">Email</dt>
              <dd className="sm:col-span-2">
                <a
                  className="focus-ring rounded-sm text-base text-content underline-offset-4 hover:underline"
                  href={`mailto:${contact.email}`}
                >
                  {contact.email}
                </a>
              </dd>
            </div>

            {contact.whatsapp ? (
              <div className="grid gap-gap-xs border-b border-line py-gap-lg sm:grid-cols-3 sm:gap-gutter">
                <dt className="text-sm text-content-muted">WhatsApp</dt>
                <dd className="sm:col-span-2">
                  <a
                    className="focus-ring rounded-sm text-base text-content underline-offset-4 hover:underline"
                    href={`https://wa.me/${contact.whatsapp.replace(/[^0-9]/g, '')}`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {contact.whatsappDisplay ?? contact.whatsapp}
                  </a>
                </dd>
              </div>
            ) : null}

            {contact.location ? (
              <div className="grid gap-gap-xs border-b border-line py-gap-lg sm:grid-cols-3 sm:gap-gutter">
                <dt className="text-sm text-content-muted">Location</dt>
                <dd className="text-base text-content sm:col-span-2">{contact.location}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>
    </section>
  )
}
