import { Mail, MapPin, MessageCircle } from 'lucide-react'

import { CONTACT } from '../content'

/**
 * How to reach a human.
 *
 * Each channel renders only when it is actually configured. An unset WhatsApp
 * number shows nothing rather than a dead link or an invented one — a supplier
 * dialling a wrong number is worse than one fewer way to get in touch.
 */
export function Contact({ contact = CONTACT }: { contact?: typeof CONTACT } = {}) {
  return (
    <section aria-labelledby="contact" className="bg-surface-sunken py-section-lg">
      <div className="mx-auto max-w-5xl px-gutter">
        <h2 id="contact" className="text-lg font-semibold tracking-tight text-content sm:text-xl">
          Talk to us
        </h2>
        <p className="mt-gap-lg max-w-2xl text-base leading-relaxed text-content-muted">
          Questions before registering? Reach us directly — we answer in English and Hindi.
        </p>

        <dl className="mt-section grid gap-gutter sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-md border border-line bg-surface p-gutter">
            <dt className="flex items-center gap-gap-xs text-2xs font-semibold uppercase tracking-[0.15em] text-content-subtle">
              <Mail className="size-4 text-accent" aria-hidden="true" strokeWidth={1.5} />
              Email
            </dt>
            <dd className="mt-gap-xs">
              <a
                className="focus-ring text-base text-content underline-offset-4 hover:underline"
                href={`mailto:${contact.email}`}
              >
                {contact.email}
              </a>
            </dd>
          </div>

          {contact.whatsapp ? (
            <div className="rounded-md border border-line bg-surface p-gutter">
              <dt className="flex items-center gap-gap-xs text-2xs font-semibold uppercase tracking-[0.15em] text-content-subtle">
                <MessageCircle
                  className="size-4 text-accent"
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
                WhatsApp
              </dt>
              <dd className="mt-gap-xs">
                <a
                  className="focus-ring text-base text-content underline-offset-4 hover:underline"
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
            <div className="rounded-md border border-line bg-surface p-gutter">
              <dt className="flex items-center gap-gap-xs text-2xs font-semibold uppercase tracking-[0.15em] text-content-subtle">
                <MapPin className="size-4 text-accent" aria-hidden="true" strokeWidth={1.5} />
                Location
              </dt>
              <dd className="mt-gap-xs text-base text-content">{contact.location}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </section>
  )
}
