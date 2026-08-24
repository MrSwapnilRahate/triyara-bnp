import type { BuyerDocumentList } from '@triyara/core'
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from '@triyara/ui'

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
 */
export function DocumentList({ list }: { list: BuyerDocumentList }) {
  if (list.items.length === 0) {
    return (
      <div className="space-y-gap-lg">
        <Header />
        <EmptyState
          title="No documents yet"
          description="Anything you send us during onboarding or verification will appear here."
        />
      </div>
    )
  }

  return (
    <div className="space-y-gap-lg">
      <Header />

      <ul className="space-y-gap">
        {list.items.map((doc, index) => (
          <li key={`${doc.fileName}-${index}`}>
            <Card>
              <CardHeader>
                <CardTitle as="h2">{doc.title}</CardTitle>
                <CardDescription>
                  {doc.fileName} &middot; {formatSize(doc.fileSize)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-gap-lg sm:grid-cols-3">
                  <Field label="Type">{humaniseType(doc.type)}</Field>
                  <Field label="Status">
                    <Badge>{humanise(doc.status)}</Badge>
                  </Field>
                  <Field label="Uploaded">{formatDate(doc.uploadedAt)}</Field>
                  {/* Only rendered when we actually hold the date. An empty row
                      would claim we know something about the document that we
                      do not. */}
                  {doc.issuedDate ? (
                    <Field label="Issued">{formatDate(doc.issuedDate)}</Field>
                  ) : null}
                  {doc.expiryDate ? (
                    <Field label="Expires">{formatDate(doc.expiryDate)}</Field>
                  ) : null}
                </dl>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {list.hasMore ? (
        <p className="text-sm text-content-muted">
          Showing your most recent documents. Your TRIYARA contact can give you the full list.
        </p>
      ) : null}
    </div>
  )
}

function Header() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold text-content">Your documents</h1>
      <p className="text-content-muted">What you have sent us, and where each one has got to.</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-sm text-content-muted">{label}</dt>
      <dd className="font-medium text-content">{children}</dd>
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
