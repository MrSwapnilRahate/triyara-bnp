'use client'

import {
  Alert,
  Badge,
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  EmptyState,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@triyara/ui'
import { ExternalLink, Mail, MessageCircle, Phone, Send } from 'lucide-react'
import Link from 'next/link'
import { type ReactNode, useState } from 'react'

import { InlineQueryError } from '@/components/data/query-boundary'

import {
  useSupplierCertificationList,
  useSupplierContacts,
  useSupplierDocuments,
  useSupplierNotes,
  useSupplierOfferings,
} from '../../suppliers/api/suppliers'
import {
  useInviteToRfq,
  useOpenRfqs,
  useSupplierQuotationHistory,
  useSupplierRfqHistory,
  useSupplierScore,
} from '../api/matching'
import type { ShortlistSupplier, SupplierScore } from '../types'

const TABS = [
  'overview',
  'contacts',
  'certifications',
  'documents',
  'notes',
  'offerings',
  'rfqs',
  'quotations',
] as const
type Tab = (typeof TABS)[number]

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview',
  contacts: 'Contacts',
  certifications: 'Certifications',
  documents: 'Documents',
  notes: 'Notes',
  offerings: 'Offerings',
  rfqs: 'RFQs',
  quotations: 'Quotations',
}

const date = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString() : '—')

function Panel({ children }: { children: ReactNode }) {
  return <div className="space-y-gap py-gap-lg">{children}</div>
}

function Loading() {
  return (
    <div className="space-y-gap py-gap-lg">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} variant="text" className="w-full" />
      ))}
    </div>
  )
}

/**
 * The supplier detail drawer (TRY-BNP-SUPPLIER-MATCH).
 *
 * Every tab reads an endpoint that already existed — contacts, certifications,
 * documents, notes and offerings are the same reads the supplier detail page
 * makes. Nothing here is a second implementation of those screens; it is the
 * same data, reachable without leaving the shortlist.
 *
 * Tabs fetch only when opened. Eight simultaneous requests on open would make
 * the drawer slower than the page it exists to avoid.
 */
export function SupplierDrawer({
  supplier,
  score,
  open,
  onClose,
}: {
  supplier: ShortlistSupplier | null
  score: SupplierScore | null
  open: boolean
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const id = supplier?.id

  const contacts = useSupplierContacts(open && tab === 'contacts' ? id : undefined)
  const certifications = useSupplierCertificationList(
    open && tab === 'certifications' ? id : undefined,
  )
  const documents = useSupplierDocuments(open && tab === 'documents' ? id : undefined)
  const notes = useSupplierNotes(open && tab === 'notes' ? id : undefined)
  const offerings = useSupplierOfferings(open && tab === 'offerings' ? id : undefined)
  const rfqs = useSupplierRfqHistory(id, open && tab === 'rfqs')
  const quotations = useSupplierQuotationHistory(id, open && tab === 'quotations')
  const liveScore = useSupplierScore(open && tab === 'overview' ? id : undefined)

  // The card's score is already correct; the fetched one only matters if the
  // drawer outlives the list it came from.
  const shown = liveScore.data ?? score

  if (!supplier) return null

  return (
    <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent side="right" width="lg">
        <DrawerHeader>
          <DrawerTitle>{supplier.companyName}</DrawerTitle>
          <div className="mt-gap-xs flex flex-wrap items-center gap-gap">
            <span className="font-mono text-2xs text-content-muted">{supplier.supplierCode}</span>
            <StatusBadge status={supplier.status} size="sm" />
            {supplier.isVerified ? (
              <Badge tone="success" size="sm" dot>
                Verified
              </Badge>
            ) : null}
          </div>

          <QuickActions supplier={supplier} />
        </DrawerHeader>

        <DrawerBody>
          <Tabs value={tab} onValueChange={(next) => setTab(next as Tab)}>
            <TabsList className="flex-wrap">
              {TABS.map((key) => (
                <TabsTrigger key={key} value={key}>
                  {TAB_LABELS[key]}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview">
              <Panel>
                {shown ? (
                  <div className="space-y-gap">
                    <div className="flex items-baseline justify-between gap-gap">
                      <span className="text-sm text-content-muted">Readiness</span>
                      <span className="text-md font-semibold text-content">{shown.score}/100</span>
                    </div>
                    <Progress value={shown.score} label="Readiness score" className="h-1" />

                    <ul className="mt-gap space-y-gap">
                      {shown.components.map((component) => (
                        <li key={component.key}>
                          <div className="flex items-baseline justify-between gap-gap">
                            <span className="text-xs font-medium text-content">
                              {component.label}
                            </span>
                            <span className="text-2xs text-content-muted">
                              {component.points}/{component.max}
                            </span>
                          </div>
                          <p className="text-2xs text-content-muted">{component.detail}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <Loading />
                )}
              </Panel>
            </TabsContent>

            <TabsContent value="contacts">
              <Panel>
                {contacts.isPending ? (
                  <Loading />
                ) : contacts.isError ? (
                  <InlineQueryError
                    error={contacts.error}
                    onRetry={() => void contacts.refetch()}
                  />
                ) : (contacts.data?.length ?? 0) === 0 ? (
                  <EmptyState size="sm" title="No contacts" />
                ) : (
                  contacts.data?.map((contact, index) => (
                    <div key={contact.id}>
                      {index > 0 ? <Separator className="my-gap" /> : null}
                      <p className="text-sm font-medium text-content">
                        {contact.name}
                        {contact.isPrimary ? (
                          <Badge tone="accent" size="sm" className="ml-gap">
                            Primary
                          </Badge>
                        ) : null}
                      </p>
                      <p className="text-2xs text-content-muted">
                        {contact.designation ?? contact.role}
                      </p>
                      <p className="text-xs text-content-muted">
                        {[contact.email, contact.phone, contact.whatsapp]
                          .filter(Boolean)
                          .join(' · ') || 'No way to reach them'}
                      </p>
                    </div>
                  ))
                )}
              </Panel>
            </TabsContent>

            <TabsContent value="certifications">
              <Panel>
                {certifications.isPending ? (
                  <Loading />
                ) : (certifications.data?.length ?? 0) === 0 ? (
                  <EmptyState size="sm" title="No certifications" />
                ) : (
                  certifications.data?.map((certification, index) => (
                    <div key={certification.id}>
                      {index > 0 ? <Separator className="my-gap" /> : null}
                      <div className="flex items-baseline justify-between gap-gap">
                        <span className="text-sm text-content">{certification.type}</span>
                        <StatusBadge status={certification.status} size="sm" />
                      </div>
                      <p className="text-2xs text-content-muted">
                        {certification.certificateNumber} · expires {date(certification.expiryDate)}
                      </p>
                    </div>
                  ))
                )}
              </Panel>
            </TabsContent>

            <TabsContent value="documents">
              <Panel>
                {documents.isPending ? (
                  <Loading />
                ) : (documents.data?.length ?? 0) === 0 ? (
                  <EmptyState size="sm" title="No documents" />
                ) : (
                  documents.data?.map((document, index) => (
                    <div key={document.id}>
                      {index > 0 ? <Separator className="my-gap" /> : null}
                      <div className="flex items-center justify-between gap-gap">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-content">
                            {document.title ?? document.type}
                          </p>
                          <p className="text-2xs text-content-muted">{document.type}</p>
                        </div>
                        <Button asChild variant="ghost" size="sm">
                          <a
                            href={`/api/suppliers/${supplier.id}/documents/${document.id}/download`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open
                          </a>
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </Panel>
            </TabsContent>

            <TabsContent value="notes">
              <Panel>
                {notes.isPending ? (
                  <Loading />
                ) : (notes.data?.items.length ?? 0) === 0 ? (
                  <EmptyState size="sm" title="No notes" />
                ) : (
                  notes.data?.items.map((note, index) => (
                    <div key={note.id}>
                      {index > 0 ? <Separator className="my-gap" /> : null}
                      <div className="flex items-baseline justify-between gap-gap">
                        <span className="text-xs font-medium text-content">
                          {note.author?.name ?? 'Former team member'}
                        </span>
                        <time dateTime={note.createdAt} className="text-2xs text-content-muted">
                          {date(note.createdAt)}
                        </time>
                      </div>
                      <p className="whitespace-pre-wrap text-xs text-content">{note.body}</p>
                    </div>
                  ))
                )}
              </Panel>
            </TabsContent>

            <TabsContent value="offerings">
              <Panel>
                {offerings.isPending ? (
                  <Loading />
                ) : (offerings.data?.items.length ?? 0) === 0 ? (
                  <EmptyState size="sm" title="No offerings" />
                ) : (
                  offerings.data?.items.map((offering, index) => (
                    <div key={offering.id}>
                      {index > 0 ? <Separator className="my-gap" /> : null}
                      <div className="flex items-baseline justify-between gap-gap">
                        <span className="text-sm text-content">
                          {offering.product?.name ?? offering.productId}
                        </span>
                        <StatusBadge status={offering.status} size="sm" />
                      </div>
                      <p className="text-2xs text-content-muted">
                        MOQ {offering.moq ?? '—'} {offering.moqUnit ?? ''} · lead{' '}
                        {offering.leadTimeDays ?? '—'}d
                      </p>
                    </div>
                  ))
                )}
              </Panel>
            </TabsContent>

            <TabsContent value="rfqs">
              <Panel>
                {rfqs.isPending ? (
                  <Loading />
                ) : (rfqs.data?.length ?? 0) === 0 ? (
                  <EmptyState size="sm" title="Never sent an RFQ" />
                ) : (
                  rfqs.data?.map((entry, index) => (
                    <div key={entry.id}>
                      {index > 0 ? <Separator className="my-gap" /> : null}
                      <div className="flex items-baseline justify-between gap-gap">
                        <span className="truncate text-sm text-content">{entry.rfq.title}</span>
                        <StatusBadge status={entry.status} size="sm" />
                      </div>
                      <p className="text-2xs text-content-muted">
                        {entry.rfq.rfqNumber} · invited {date(entry.invitedAt)} ·{' '}
                        {entry.respondedAt ? `replied ${date(entry.respondedAt)}` : 'no reply'}
                        {entry.isLate ? ' · late' : ''}
                      </p>
                    </div>
                  ))
                )}
              </Panel>
            </TabsContent>

            <TabsContent value="quotations">
              <Panel>
                {quotations.isPending ? (
                  <Loading />
                ) : (quotations.data?.length ?? 0) === 0 ? (
                  <EmptyState size="sm" title="Never quoted" />
                ) : (
                  quotations.data?.map((entry, index) => (
                    <div key={entry.id}>
                      {index > 0 ? <Separator className="my-gap" /> : null}
                      <div className="flex items-baseline justify-between gap-gap">
                        <span className="truncate text-sm text-content">
                          {entry.quotationItem.quotation.quotationNumber}
                        </span>
                        {entry.isSelected ? (
                          <Badge tone="success" size="sm">
                            Chosen
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-2xs text-content-muted">
                        {entry.quotationItem.description ?? '—'} · {entry.supplierCurrency}{' '}
                        {entry.supplierPrice}
                        {entry.incoterm ? ` ${entry.incoterm}` : ''}
                        {entry.port ? ` ${entry.port}` : ''}
                      </p>
                    </div>
                  ))
                )}
              </Panel>
            </TabsContent>
          </Tabs>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}

/**
 * Call, WhatsApp, Email, Open, Invite.
 *
 * The first three read the supplier's own email and phone rather than fetching
 * contacts: those are on the shortlist row already, and a quick action that has
 * to wait for a request is not quick. A channel with nothing behind it is
 * disabled rather than hidden, so the row does not reflow as data arrives.
 */
function QuickActions({ supplier }: { supplier: ShortlistSupplier }) {
  const [picking, setPicking] = useState(false)
  const phone = supplier.phone?.replace(/[^\d+]/g, '')

  return (
    <div className="mt-gap-lg space-y-gap">
      <div className="flex flex-wrap gap-gap">
        <Button
          asChild={Boolean(phone)}
          variant="secondary"
          size="sm"
          leadingIcon={<Phone />}
          disabled={!phone}
        >
          {phone ? <a href={`tel:${phone}`}>Call</a> : <span>Call</span>}
        </Button>

        <Button
          asChild={Boolean(phone)}
          variant="secondary"
          size="sm"
          leadingIcon={<MessageCircle />}
          disabled={!phone}
        >
          {phone ? (
            <a
              href={`https://wa.me/${phone.replace(/^\+/, '')}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
          ) : (
            <span>WhatsApp</span>
          )}
        </Button>

        <Button
          asChild={Boolean(supplier.email)}
          variant="secondary"
          size="sm"
          leadingIcon={<Mail />}
          disabled={!supplier.email}
        >
          {supplier.email ? <a href={`mailto:${supplier.email}`}>Email</a> : <span>Email</span>}
        </Button>

        <Button asChild variant="secondary" size="sm" leadingIcon={<ExternalLink />}>
          <Link href={`/suppliers/${supplier.id}`}>Open supplier</Link>
        </Button>

        <Button
          variant="primary"
          size="sm"
          leadingIcon={<Send />}
          onClick={() => setPicking((open) => !open)}
        >
          Invite to RFQ
        </Button>
      </div>

      {picking ? <InvitePicker supplierId={supplier.id} onDone={() => setPicking(false)} /> : null}
    </div>
  )
}

/**
 * Picks which RFQ to add the supplier to.
 *
 * Only RFQs that can still take one — the API decides which states those are,
 * so this screen cannot drift from it.
 */
function InvitePicker({ supplierId, onDone }: { supplierId: string; onDone: () => void }) {
  const [rfqId, setRfqId] = useState('')
  const rfqs = useOpenRfqs(true)
  const invite = useInviteToRfq()

  if (rfqs.isPending) return <Loading />
  if ((rfqs.data?.length ?? 0) === 0) {
    return (
      <Alert tone="info" title="No open RFQs">
        Create an RFQ first, then invite this supplier to it.
      </Alert>
    )
  }

  return (
    <div className="space-y-gap rounded-sm border border-line p-gap">
      <Select value={rfqId} onValueChange={setRfqId}>
        <SelectTrigger aria-label="Choose an RFQ">
          <SelectValue placeholder="Choose an RFQ" />
        </SelectTrigger>
        <SelectContent>
          {rfqs.data?.map((rfq) => (
            <SelectItem key={rfq.id} value={rfq.id}>
              {rfq.rfqNumber} — {rfq.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {invite.isError ? (
        <p role="alert" className="text-2xs text-danger">
          {invite.error instanceof Error ? invite.error.message : 'The invitation failed.'}
        </p>
      ) : null}

      {invite.isSuccess ? (
        <p role="status" className="text-2xs text-success">
          Invited.
        </p>
      ) : null}

      <div className="flex gap-gap">
        <Button
          size="sm"
          disabled={!rfqId}
          loading={invite.isPending}
          onClick={() => {
            invite.mutate({ rfqId, supplierId }, { onSuccess: () => setTimeout(onDone, 800) })
          }}
        >
          Send invitation
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
