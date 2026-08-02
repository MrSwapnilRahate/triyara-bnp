'use client'

import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Separator,
  Skeleton,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@triyara/ui'
import { Pencil, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

import { InlineQueryError } from '@/components/data/query-boundary'
import { Can } from '@/lib/ability-context'

import { useSupplier } from '../api/suppliers'
import { expiringSoon, isExpired, type SupplierCertification } from '../types'
import { SupplierCertificationsTab } from './supplier-certifications-tab'
import { SupplierContactsTab } from './supplier-contacts-tab'
import { SupplierDocumentsTab } from './supplier-documents-tab'
import { SupplierNotes } from './supplier-notes'
import { SupplierProducts } from './supplier-products'

/** Supplier detail (TRY-BNP-PORTAL-01 §9). */
export function SupplierDetail({ id }: { id: string }) {
  const query = useSupplier(id)

  if (query.isPending) return <SupplierDetailSkeleton />
  if (query.isError)
    return (
      <div className="p-gutter">
        <InlineQueryError error={query.error} onRetry={() => void query.refetch()} />
      </div>
    )

  const { supplier } = query.data
  const lapsing = expiringSoon(supplier.certifications ?? [])

  return (
    <PageHeader
      title={supplier.companyName}
      identifier={supplier.supplierCode}
      status={
        <>
          <StatusBadge status={supplier.status} />
          {supplier.isVerified ? (
            <Badge tone="success" dot>
              Verified
            </Badge>
          ) : null}
        </>
      }
      description={supplier.legalName}
      meta={[
        {
          label: 'Business type',
          value:
            supplier.businessType.charAt(0) +
            supplier.businessType.slice(1).toLowerCase().replace(/_/g, ' '),
        },
        {
          label: 'Location',
          value: [supplier.city, supplier.country].filter(Boolean).join(', ') || '—',
        },
        { label: 'Email', value: supplier.email ?? '—' },
        { label: 'Phone', value: supplier.phone ?? '—' },
        { label: 'GST', value: supplier.gstNumber ?? '—' },
      ]}
      actions={
        <Can action="update" subject="SupplierProfile">
          <Button asChild variant="secondary" leadingIcon={<Pencil />}>
            <Link href={`/suppliers/${supplier.id}/edit`}>Edit</Link>
          </Button>
        </Can>
      }
      tabs={
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="contacts" count={supplier.contacts?.length ?? 0}>
              Contacts
            </TabsTrigger>
            <TabsTrigger value="addresses" count={supplier.addresses?.length ?? 0}>
              Addresses
            </TabsTrigger>
            <TabsTrigger value="certifications" count={supplier.certifications?.length ?? 0}>
              Certifications
            </TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="banking" count={supplier.bankAccounts?.length ?? 0}>
              Banking
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="p-gutter">
            <div className="grid max-w-4xl gap-gutter sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Registrations</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-gap">
                    <Row label="GST" value={supplier.gstNumber} />
                    <Row label="IEC" value={supplier.iecNumber} />
                    <Row label="PAN" value={supplier.panNumber} />
                    <Row label="Website" value={supplier.website} />
                  </dl>
                </CardContent>
              </Card>
              {lapsing > 0 ? (
                <Alert tone="warning" title="Certifications lapsing soon">
                  {lapsing} certification{lapsing === 1 ? '' : 's'} expire within 30 days.
                </Alert>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="contacts">
            <SupplierContactsTab supplierId={supplier.id} />
          </TabsContent>

          <TabsContent value="addresses" className="p-gutter">
            <Card className="max-w-3xl">
              <CardContent className="p-0">
                {(supplier.addresses?.length ?? 0) === 0 ? (
                  <EmptyState size="sm" title="No addresses" />
                ) : (
                  supplier.addresses.map((address, index) => (
                    <div key={address.id}>
                      {index > 0 ? <Separator /> : null}
                      <div className="px-gutter py-gap-lg">
                        <p className="text-2xs uppercase tracking-wide text-content-subtle">
                          {address.type}
                          {address.isPrimary ? ' · Primary' : ''}
                        </p>
                        <p className="mt-gap-xs text-base text-content">{address.line1}</p>
                        <p className="text-xs text-content-muted">
                          {[address.city, address.state, address.postalCode, address.country]
                            .filter(Boolean)
                            .join(', ')}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="certifications">
            <SupplierCertificationsTab supplierId={supplier.id} />
          </TabsContent>

          <TabsContent value="documents">
            <SupplierDocumentsTab supplierId={supplier.id} />
          </TabsContent>

          <TabsContent value="products" className="p-gutter">
            <SupplierProducts supplierId={supplier.id} />
          </TabsContent>

          <TabsContent value="notes" className="p-gutter">
            <SupplierNotes supplierId={supplier.id} />
          </TabsContent>

          <TabsContent value="banking" className="p-gutter">
            <Card className="max-w-3xl">
              <CardContent className="p-0">
                {(supplier.bankAccounts?.length ?? 0) === 0 ? (
                  <EmptyState size="sm" title="No bank accounts" />
                ) : (
                  <>
                    {supplier.bankAccounts.map((account, index) => (
                      <div key={account.id}>
                        {index > 0 ? <Separator /> : null}
                        <div className="flex items-start justify-between gap-gap-lg px-gutter py-gap-lg">
                          <div>
                            <p className="text-base font-medium text-content">{account.bankName}</p>
                            <p className="text-xs text-content-muted">
                              {account.accountHolderName}
                              {account.branchName ? ` · ${account.branchName}` : ''}
                            </p>
                          </div>
                          <div className="text-right text-xs text-content-muted">
                            <p className="font-mono">
                              {account.ifscCode ?? account.swiftCode ?? '—'}
                            </p>
                            <p>{account.currency}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    <Separator />
                    {/* The API's projection omits accountNumber entirely, so it
                        cannot reach the client. Saying so makes the absence read
                        as a deliberate control rather than missing data. */}
                    <p className="px-gutter py-gap text-xs text-content-subtle">
                      Account numbers are not retrievable through this application.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      }
    />
  )
}

function CertificationRow({ certification }: { certification: SupplierCertification }) {
  const expired = isExpired(certification)
  const lapsingSoon =
    !expired &&
    certification.expiryDate !== null &&
    new Date(certification.expiryDate).getTime() < Date.now() + 30 * 86_400_000

  return (
    <div className="flex items-start justify-between gap-gap-lg px-gutter py-gap-lg">
      <div>
        <p className="text-base font-medium text-content">{certification.type}</p>
        <p className="text-xs text-content-muted">
          {certification.certificateNumber ?? '—'}
          {certification.issuedBy ? ` · ${certification.issuedBy}` : ''}
        </p>
      </div>
      <div className="text-right">
        {certification.expiryDate ? (
          <p className="text-xs text-content-muted">
            Expires {new Date(certification.expiryDate).toLocaleDateString()}
          </p>
        ) : (
          <p className="text-xs text-content-subtle">No expiry</p>
        )}
        {expired ? (
          <Badge tone="danger" size="sm" dot>
            Expired
          </Badge>
        ) : lapsingSoon ? (
          <Badge tone="warning" size="sm" dot>
            Lapsing soon
          </Badge>
        ) : (
          <StatusBadge status={certification.status} size="sm" />
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-gap-lg">
      <dt className="text-xs text-content-muted">{label}</dt>
      <dd className="text-base text-content">{value ?? '—'}</dd>
    </div>
  )
}

function SupplierDetailSkeleton() {
  return (
    <div className="border-b border-line bg-surface px-gutter py-gap-lg">
      <Skeleton variant="text" className="h-6 w-64" />
      <div className="mt-gap-lg flex gap-section">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-gap-xs">
            <Skeleton variant="text" className="w-16" />
            <Skeleton variant="text" className="w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
