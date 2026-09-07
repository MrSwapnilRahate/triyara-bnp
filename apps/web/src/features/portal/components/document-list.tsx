import type { BuyerDocumentList } from '@triyara/core'
import { Badge, EmptyState, PageHeader } from '@triyara/ui'

/**
 * The documents on the buyer's own account.
 *
 * Presentational: it takes the list the service built and nothing else. These
 * are the compliance papers the buyer gave us at onboarding - their GST, their
 * IEC, their company registration - shown back to them with where each one got
 * to.
 *
 * Read-only, and deliberately not openable. There is no download control and no
 * link: the file is described by name, size and type, but the storage key that
 * would fetch it is never fetched from the database, so there is nothing here to
 * turn into a URL. Opening a file is a separate batch with its own
 * account-scoped lookup.
 *
 * Of the four portal lists this is the one that most wanted to stop being a
 * stack of cards: a register of papers is a register, and a border around each
 * entry was saying nothing the row spacing did not.
 */
export function DocumentList({ list }: { list: BuyerDocumentList }) {
  if (list.items.length === 0) {
    return (
      <>
        <Header />
        <EmptyState
          title="No documents yet"
          description="Anything you send us during onboarding or verification will appear here."
        />
      </>
    )
  }

  return (
    <>
      <Header />

      <ul className="divide-y divide-line">
        {list.items.map((doc, index) => (
          <li key={`${doc.fileName}-${index}`} className="py-gap-lg">
            <div className="flex flex-wrap items-baseline justify-between gap-gap-lg">
              <h2 className="text-md font-medium text-content">{doc.title}</h2>
              <p className="flex flex-wrap items-baseline gap-gap text-sm text-content-muted">
                {/* The file as the buyer's own machine would name it. */}
                <span className="font-mono">{doc.fileName}</span>
                <span className="tabular-nums">{formatSize(doc.fileSize)}</span>
              </p>
            </div>
            <dl className="mt-gap flex flex-wrap gap-x-section gap-y-gap">
              <Field label="Type">{humaniseType(doc.type)}</Field>
              <Field label="Status">
                <Badge>{humanise(doc.status)}</Badge>
              </Field>
              <Field label="Uploaded">{formatDate(doc.uploadedAt)}</Field>
              {/* Only rendered when we actually hold the date. An empty row
                  would claim we know something about the document that we
                  do not. */}
              {doc.issuedDate ? <Field label="Issued">{formatDate(doc.issuedDate)}</Field> : null}
              {doc.expiryDate ? <Field label="Expires">{formatDate(doc.expiryDate)}</Field> : null}
            </dl>
          </li>
        ))}
      </ul>

      {list.hasMore ? (
        <p className="mt-gap-lg text-sm text-content-muted">
          Showing your most recent documents. Your TRIYARA contact can give you the full list.
        </p>
      ) : null}
    </>
  )
}

function Header() {
  return (
    <PageHeader
      className="-mx-gutter mb-gap-lg"
      title="Your documents"
      description="What you have sent us, and where each one has got to."
    />
  )
}

/** One fact about a document: what it is, then what it says. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-gap">
      <dt className="text-sm text-content-muted">{label}</dt>
      <dd className="text-base font-medium text-content">{children}</dd>
    </div>
  )
}

/**
 * The `DocumentType` members that are acronyms and must survive intact.
 *
 * An explicit set rather than a rule. Every heuristic I tried mis-fires on this
 * enum: "no underscore" also catches OTHER, and a length cut-off also catches
 * it, while "all capitals" catches every status too. The members are fixed and
 * few, so naming them is both shorter and correct.
 */
const ACRONYM_TYPES = new Set([
  'GST',
  'IEC',
  'FSSAI',
  'APEDA',
  'ISO',
  'HACCP',
  'BRC',
  'PAN',
  'MSME',
])

/** `COMPANY_REGISTRATION` reads badly to somebody who does not work here. */
function humanise(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ')
}

/** As above, but `GST` must not become `Gst`. */
function humaniseType(value: string): string {
  return ACRONYM_TYPES.has(value) ? value : humanise(value)
}

/** Binary units, because that is what a file manager shows for the same file. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(1)} ${units[unit]}`
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(value)
}
