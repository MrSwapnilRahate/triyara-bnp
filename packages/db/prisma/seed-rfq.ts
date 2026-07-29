import type { PrismaClient } from '@prisma/client'

// RFQ Management seed (TRY-BNP-RFQ-01).
//
// Idempotent: RFQs are upserted on their tenant-scoped number, and every owned
// collection is replaced wholesale so re-running never duplicates rows and never
// trips the one-current-response-per-line constraint.

type RfqSeed = {
  rfqNumber: string
  type: 'BUYER' | 'INTERNAL'
  title: string
  description: string
  currency: string
  incoterm: 'FOB' | 'CIF' | 'EXW'
  destinationCountry: string
  destinationPort: string
  quotationDeadline: Date
  expectedShipmentDate: Date
  status: 'DRAFT' | 'ISSUED' | 'IN_PROGRESS' | 'EVALUATING'
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  /** Catalog SKUs requested; a null sku means a free-text custom line. */
  items: Array<{
    sku?: string
    customProductName?: string
    quantity: string
    unit: string
    targetPrice?: string
    packaging?: string
    remarks?: string
    specifications?: Record<string, string>
    requiredCertifications?: Array<'ISO' | 'FSSAI' | 'HACCP' | 'ORGANIC' | 'HALAL'>
  }>
  /** Supplier codes invited, with their participation state. */
  suppliers: Array<{
    supplierCode: string
    status: 'INVITED' | 'VIEWED' | 'ACCEPTED' | 'DECLINED' | 'SUBMITTED'
    isLate?: boolean
    declineReason?: string
    quotation?: {
      currency: string
      incoterm: 'FOB' | 'CIF' | 'EXW'
      port: string
      validUntilDays: number
      remarks?: string
      /** Priced lines keyed by line number. */
      lines: Array<{ lineNumber: number; price: string; moq?: string; leadTimeDays?: number }>
    }
  }>
  comments: Array<{ body: string; replies?: string[] }>
  approvals: Array<{
    from: 'DRAFT' | 'PENDING' | null
    to: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
    comments?: string
  }>
}

const DAY = 24 * 60 * 60 * 1000
const BASE = new Date('2026-08-01T00:00:00.000Z')

const RFQS: RfqSeed[] = [
  {
    rfqNumber: 'RFQ-2026-000001',
    type: 'BUYER',
    title: 'Q3 spice programme - Gulf distribution',
    description:
      'Consolidated requirement for turmeric and chilli powder for Q3 shipment to Dubai. ' +
      'Steam sterilised, retail-grade packing required.',
    currency: 'USD',
    incoterm: 'CIF',
    destinationCountry: 'AE',
    destinationPort: 'Jebel Ali',
    quotationDeadline: new Date(BASE.getTime() + 14 * DAY),
    expectedShipmentDate: new Date(BASE.getTime() + 60 * DAY),
    status: 'EVALUATING',
    priority: 'HIGH',
    items: [
      {
        sku: 'TRY-TUR-001',
        quantity: '36',
        unit: 'MT',
        targetPrice: '1800',
        packaging: '25 kg PP bag with liner',
        specifications: { curcumin: '>=3%', moisture: '<8%', mesh: '80' },
        requiredCertifications: ['ISO', 'FSSAI', 'HACCP'],
        remarks: 'Steam sterilised, metal detected.',
      },
      {
        sku: 'TRY-CHI-001',
        quantity: '18',
        unit: 'MT',
        targetPrice: '2200',
        packaging: '20 kg carton',
        specifications: { shu: '35000', moisture: '<10%' },
        requiredCertifications: ['FSSAI'],
      },
    ],
    suppliers: [
      {
        supplierCode: 'SUP-000001',
        status: 'SUBMITTED',
        quotation: {
          currency: 'USD',
          incoterm: 'CIF',
          port: 'Jebel Ali',
          validUntilDays: 30,
          remarks: 'Rates firm for 30 days. Container loading from Nhava Sheva.',
          lines: [
            { lineNumber: 1, price: '1780', moq: '18', leadTimeDays: 21 },
            { lineNumber: 2, price: '2150', moq: '15', leadTimeDays: 21 },
          ],
        },
      },
      {
        supplierCode: 'SUP-000002',
        status: 'DECLINED',
        declineReason: 'No turmeric capacity in the requested window.',
      },
      { supplierCode: 'SUP-000003', status: 'VIEWED' },
    ],
    comments: [
      {
        body: 'Buyer indicated 1800 USD is a hard ceiling on the turmeric line.',
        replies: ['Noted - SUP-000001 is 20 under, so there is room on freight.'],
      },
    ],
    approvals: [
      { from: null, to: 'DRAFT', comments: 'RFQ raised from buyer enquiry.' },
      { from: 'DRAFT', to: 'PENDING', comments: 'Submitted for commercial review.' },
      { from: 'PENDING', to: 'APPROVED', comments: 'Approved for issue to three suppliers.' },
    ],
  },
  {
    rfqNumber: 'RFQ-2026-000002',
    type: 'INTERNAL',
    title: 'Dehydrated onion - stock replenishment',
    description: 'Internal sourcing exercise to rebuild onion powder stock ahead of Q4.',
    currency: 'USD',
    incoterm: 'FOB',
    destinationCountry: 'IN',
    destinationPort: 'Nhava Sheva',
    quotationDeadline: new Date(BASE.getTime() + 10 * DAY),
    expectedShipmentDate: new Date(BASE.getTime() + 45 * DAY),
    status: 'IN_PROGRESS',
    priority: 'NORMAL',
    items: [
      {
        sku: 'TRY-ONI-001',
        quantity: '24',
        unit: 'MT',
        targetPrice: '2300',
        specifications: { moisture: '<5%', mesh: '100' },
        requiredCertifications: ['HACCP'],
      },
      {
        customProductName: 'Dehydrated shallot flakes',
        quantity: '5',
        unit: 'MT',
        remarks: 'Not yet catalogued - add to the catalog if this becomes recurring.',
      },
    ],
    suppliers: [
      {
        supplierCode: 'SUP-000002',
        status: 'SUBMITTED',
        quotation: {
          currency: 'USD',
          incoterm: 'FOB',
          port: 'Nhava Sheva',
          validUntilDays: 21,
          lines: [{ lineNumber: 1, price: '2260', moq: '12', leadTimeDays: 18 }],
        },
      },
      { supplierCode: 'SUP-000001', status: 'INVITED' },
    ],
    comments: [{ body: 'Shallot line is exploratory - do not commit without a sample.' }],
    approvals: [
      { from: null, to: 'DRAFT' },
      { from: 'DRAFT', to: 'PENDING' },
      { from: 'PENDING', to: 'APPROVED', comments: 'Internal replenishment approved.' },
    ],
  },
  {
    rfqNumber: 'RFQ-2026-000003',
    type: 'BUYER',
    title: 'Cumin seed enquiry - EU buyer',
    description: 'First enquiry from a new European buyer. Awaiting internal approval to issue.',
    currency: 'EUR',
    incoterm: 'CIF',
    destinationCountry: 'NL',
    destinationPort: 'Rotterdam',
    quotationDeadline: new Date(BASE.getTime() + 21 * DAY),
    expectedShipmentDate: new Date(BASE.getTime() + 75 * DAY),
    status: 'DRAFT',
    priority: 'LOW',
    items: [
      {
        sku: 'TRY-CUM-001',
        quantity: '19',
        unit: 'MT',
        targetPrice: '3000',
        requiredCertifications: ['ORGANIC'],
      },
    ],
    suppliers: [],
    comments: [],
    approvals: [{ from: null, to: 'DRAFT', comments: 'Draft raised, pending buyer confirmation.' }],
  },
]

export async function seedRfqs(prisma: PrismaClient, organizationId: string) {
  const products = await prisma.product.findMany({
    where: { organizationId },
    select: { id: true, sku: true },
  })
  const productBySku = new Map(products.map((p) => [p.sku, p.id]))

  const suppliers = await prisma.supplier.findMany({
    where: { organizationId },
    select: { id: true, supplierCode: true },
  })
  const supplierByCode = new Map(suppliers.map((s) => [s.supplierCode, s.id]))

  const user = await prisma.user.findFirst({ where: { organizationId }, select: { id: true } })
  const actorId = user?.id ?? 'seed'

  // A BUYER rfq requires an external Account (enforced by the
  // RFQ_buyer_matches_type check). The base seed creates no Account, so make
  // one here rather than silently skipping every buyer-originated RFQ.
  let account = await prisma.account.findFirst({
    where: { organizationId, deletedAt: null },
    select: { id: true },
  })
  if (!account) {
    account = await prisma.account.create({
      data: {
        organizationId,
        legalName: 'Gulf Spice Trading LLC',
        displayName: 'Gulf Spice Trading',
        country: 'AE',
        relationshipStatus: 'ACTIVE',
        source: 'seed',
        createdById: actorId,
        updatedById: actorId,
      },
      select: { id: true },
    })
  }

  let seeded = 0
  for (const r of RFQS) {
    seeded += 1

    const rfq = await prisma.rFQ.upsert({
      where: { organizationId_rfqNumber: { organizationId, rfqNumber: r.rfqNumber } },
      update: {
        title: r.title,
        description: r.description,
        status: r.status,
        priority: r.priority,
      },
      create: {
        organizationId,
        rfqNumber: r.rfqNumber,
        type: r.type,
        buyerId: r.type === 'BUYER' ? account.id : null,
        title: r.title,
        description: r.description,
        currency: r.currency,
        incoterm: r.incoterm,
        destinationCountry: r.destinationCountry,
        destinationPort: r.destinationPort,
        quotationDeadline: r.quotationDeadline,
        expectedShipmentDate: r.expectedShipmentDate,
        status: r.status,
        priority: r.priority,
        createdById: actorId,
      },
    })

    // Owned collections replaced wholesale - keeps the seed idempotent and
    // cannot violate the one-current-response-per-line constraint.
    await prisma.rFQSupplierResponse.deleteMany({ where: { rfqSupplier: { rfqId: rfq.id } } })
    await prisma.rFQSupplier.deleteMany({ where: { rfqId: rfq.id } })
    await prisma.rFQItem.deleteMany({ where: { rfqId: rfq.id } })
    await prisma.rFQComment.deleteMany({ where: { rfqId: rfq.id } })
    await prisma.rFQApproval.deleteMany({ where: { rfqId: rfq.id } })
    await prisma.rFQRevision.deleteMany({ where: { rfqId: rfq.id } })

    const itemIdByLine = new Map<number, string>()
    for (const [i, item] of r.items.entries()) {
      const row = await prisma.rFQItem.create({
        data: {
          rfqId: rfq.id,
          organizationId,
          lineNumber: i + 1,
          productId: item.sku ? (productBySku.get(item.sku) ?? null) : null,
          customProductName: item.sku ? null : (item.customProductName ?? 'Uncatalogued item'),
          quantity: item.quantity,
          unit: item.unit,
          targetPrice: item.targetPrice,
          targetCurrency: item.targetPrice ? r.currency : null,
          specifications: item.specifications,
          requiredCertifications: item.requiredCertifications ?? [],
          packaging: item.packaging,
          remarks: item.remarks,
        },
        select: { id: true, lineNumber: true },
      })
      itemIdByLine.set(row.lineNumber, row.id)
    }

    for (const s of r.suppliers) {
      const supplierId = supplierByCode.get(s.supplierCode)
      if (!supplierId) continue

      const participation = await prisma.rFQSupplier.create({
        data: {
          rfqId: rfq.id,
          organizationId,
          supplierId,
          status: s.status,
          invitedById: actorId,
          viewedAt: s.status === 'INVITED' ? null : new Date(BASE.getTime() + DAY),
          respondedAt: ['ACCEPTED', 'DECLINED', 'SUBMITTED'].includes(s.status)
            ? new Date(BASE.getTime() + 2 * DAY)
            : null,
          declineReason: s.declineReason,
          submittedAt: s.status === 'SUBMITTED' ? new Date(BASE.getTime() + 5 * DAY) : null,
          isLate: s.isLate ?? false,
          quotationCurrency: s.quotation?.currency,
          quotationIncoterm: s.quotation?.incoterm,
          quotationPort: s.quotation?.port,
          quotationValidUntil: s.quotation
            ? new Date(BASE.getTime() + s.quotation.validUntilDays * DAY)
            : null,
          quotationRemarks: s.quotation?.remarks,
          quotationTotal: s.quotation
            ? s.quotation.lines.reduce((sum, l) => sum + Number(l.price), 0).toFixed(4)
            : null,
        },
        select: { id: true },
      })

      for (const line of s.quotation?.lines ?? []) {
        const rfqItemId = itemIdByLine.get(line.lineNumber)
        if (!rfqItemId) continue
        await prisma.rFQSupplierResponse.create({
          data: {
            rfqSupplierId: participation.id,
            rfqItemId,
            organizationId,
            revisionNumber: 1,
            isCurrent: true,
            price: line.price,
            currency: s.quotation!.currency,
            moq: line.moq,
            moqUnit: 'MT',
            leadTimeDays: line.leadTimeDays,
            incoterm: s.quotation!.incoterm,
            port: s.quotation!.port,
            validUntil: new Date(BASE.getTime() + s.quotation!.validUntilDays * DAY),
          },
        })
      }
    }

    for (const c of r.comments) {
      const root = await prisma.rFQComment.create({
        data: { rfqId: rfq.id, organizationId, authorId: actorId, body: c.body },
        select: { id: true },
      })
      for (const reply of c.replies ?? []) {
        await prisma.rFQComment.create({
          data: {
            rfqId: rfq.id,
            organizationId,
            authorId: actorId,
            body: reply,
            parentId: root.id,
          },
        })
      }
    }

    for (const [i, a] of r.approvals.entries()) {
      await prisma.rFQApproval.create({
        data: {
          rfqId: rfq.id,
          organizationId,
          fromStatus: a.from,
          toStatus: a.to,
          sequence: i + 1,
          approverId: actorId,
          comments: a.comments,
        },
      })
    }

    await prisma.rFQRevision.create({
      data: {
        rfqId: rfq.id,
        organizationId,
        // RFQRevision carries a single revisionNumber - unlike the quotation
        // design, an RFQ mutates in place rather than forking per revision.
        revisionNumber: 1,
        reason: 'Initial issue.',
        snapshot: {
          rfqNumber: r.rfqNumber,
          title: r.title,
          items: r.items.map((i) => ({ sku: i.sku ?? null, quantity: i.quantity, unit: i.unit })),
        },
        changedById: actorId,
      },
    })
  }

  return { rfqs: seeded }
}
