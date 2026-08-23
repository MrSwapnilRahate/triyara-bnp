import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Partner Portal · Triyara BNP' }

/**
 * The portal's landing page, deliberately empty of data.
 *
 * A placeholder rather than a dashboard, and it stays that way until record
 * scoping exists. Nothing here reads an account, a buyer, a supplier, an RFQ or
 * a quotation - EXTERNAL_PARTY holds no ability that would allow it, and a
 * screen that queried anything now would be the first place to get scoping
 * wrong.
 *
 * What it proves by existing: an external identity can sign in, reach its own
 * namespace, and reach nothing else.
 */
export default function Page() {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold">Welcome to the TRIYARA Partner Portal</h1>
      <p className="text-muted-foreground">
        Your account is set up. We&rsquo;re preparing your portal — your requirements, quotations
        and documents will appear here.
      </p>
      <p className="text-muted-foreground">
        In the meantime, your TRIYARA contact remains the best way to reach us.
      </p>
    </section>
  )
}
