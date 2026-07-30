import type { PrismaClient } from '@prisma/client'

// Quotation Engine seed (TRY-BNP-QUOTE-01).
//
// Idempotent: payment terms and rates upsert on their natural keys, and each
// quotation is keyed by (organizationId, quotationNumber, revisionNumber) with
// every owned collection replaced wholesale. Re-running never duplicates rows
// and never trips the one-selected-supplier-per-line index.
//
// Quotation lines are sourced from SEEDED RFQ LINES where one exists, so the
// sourcing chain RFQ -> supplier bid -> quotation is demonstrable end to end.

type QuotationSeed = {
  quotationNumber: string
  type: 'BUDGETARY' | 'FIRM' | 'PROFORMA'
  title: string
  description: string
  currency: string
  baseCurrency: string
  incoterm: 'FOB' | 'CIF' | 'EXW'
  destinationCountry: string
  destinationPort: string
  paymentTermCode: string
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'SENT' | 'UNDER_NEGOTIATION'
  validForDays: number
  leadTimeDays: number
  /** RFQ number whose lines this quotation answers, when there is one. */
  fromRfqNumber?: string
  items: Array<{
    sku?: string
    customProductName?: string
    quantity: string
    unit: string
    unitCost: string
    unitPrice: string
    hsCode?: string
    countryOfOrigin?: string
    packaging?: string
    /** Candidate suppliers with their landed cost, cheapest not always chosen. */
    options?: Array<{
      supplierCode: string
      supplierPrice: string
      supplierCurrency: string
      landedUnitCost: string
      leadTimeDays: number
      incoterm: 'FOB' | 'CIF' | 'EXW'
      isSelected?: boolean
      selectionReason?: string
    }>
  }>
  charges: Array<{
    type: 'FREIGHT' | 'INSURANCE' | 'PACKING' | 'INSPECTION' | 'DISCOUNT' | 'BANK_CHARGES'
    basis: 'FIXED_AMOUNT' | 'PERCENTAGE' | 'PER_UNIT'
    label: string
    rate?: string
    amount: string
    isDeduction?: boolean
  }>
  taxes: Array<{
    type: 'IGST' | 'GST' | 'VAT' | 'CUSTOMS_DUTY'
    code: string
    jurisdiction: string
    ratePercent: string
    isReverseCharge?: boolean
  }>
  /** QuotationApproval records the approval-chain hop, not the document status. */
  approvals: Array<{
    from: 'DRAFT' | 'PENDING' | 'APPROVED'
    to: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED'
    comments: string
  }>
  /**
   * Quotation comments are an INTERNAL thread only - the
   * QuotationComment_internal_only check enforces it, so no flag is carried.
   */
  comments: string[]
}

const PAYMENT_TERMS = [
  {
    code: 'TT_ADVANCE_30',
    name: '30% advance, balance against documents',
    netDays: 30,
    advance: 30,
  },
  { code: 'LC_AT_SIGHT', name: 'Irrevocable LC at sight', netDays: 0, advance: 0 },
  { code: 'NET_45', name: 'Net 45 days from bill of lading', netDays: 45, advance: 0 },
]

const EXCHANGE_RATES = [
  { from: 'USD', to: 'INR', rate: '83.4500' },
  { from: 'EUR', to: 'INR', rate: '90.1200' },
  { from: 'AED', to: 'INR', rate: '22.7300' },
]

const QUOTATIONS: QuotationSeed[] = [
  {
    quotationNumber: 'QT-2026-0001',
    type: 'FIRM',
    title: 'Turmeric finger and cumin seed - Gulf Spice Trading',
    description: 'Firm offer against RFQ-2026-0001, two 20ft containers, Nhava Sheva to Jebel Ali.',
    currency: 'USD',
    baseCurrency: 'INR',
    incoterm: 'CIF',
    destinationCountry: 'AE',
    destinationPort: 'Jebel Ali',
    paymentTermCode: 'TT_ADVANCE_30',
    status: 'SENT',
    validForDays: 30,
    leadTimeDays: 21,
    fromRfqNumber: 'RFQ-2026-000001',
    items: [
      {
        // Line 1 of RFQ-2026-000001: turmeric fingers, 36 MT.
        sku: 'TRY-TUR-001',
        quantity: '36',
        unit: 'MT',
        unitCost: '1940.0000',
        unitPrice: '2380.0000',
        hsCode: '091030',
        countryOfOrigin: 'IN',
        packaging: '25 kg PP laminated bags, 40 bags per MT',
        options: [
          {
            supplierCode: 'SUP-000001',
            supplierPrice: '158000.0000',
            supplierCurrency: 'INR',
            landedUnitCost: '1940.0000',
            leadTimeDays: 18,
            incoterm: 'FOB',
            isSelected: true,
            selectionReason: 'Lowest landed cost with an FSSAI and ISO certified facility.',
          },
          {
            supplierCode: 'SUP-000002',
            supplierPrice: '164500.0000',
            supplierCurrency: 'INR',
            landedUnitCost: '2030.0000',
            leadTimeDays: 15,
            incoterm: 'FOB',
          },
        ],
      },
      {
        // Line 2 of RFQ-2026-000001: red chilli, 18 MT.
        sku: 'TRY-CHI-001',
        quantity: '18',
        unit: 'MT',
        unitCost: '2610.0000',
        unitPrice: '3150.0000',
        hsCode: '090422',
        countryOfOrigin: 'IN',
        packaging: '25 kg jute bags',
        options: [
          {
            supplierCode: 'SUP-000002',
            supplierPrice: '218000.0000',
            supplierCurrency: 'INR',
            landedUnitCost: '2610.0000',
            leadTimeDays: 20,
            incoterm: 'FOB',
            isSelected: true,
            selectionReason: 'Only bidder able to meet the 99.5% purity specification.',
          },
          {
            supplierCode: 'SUP-000003',
            supplierPrice: '206500.0000',
            supplierCurrency: 'INR',
            landedUnitCost: '2475.0000',
            leadTimeDays: 42,
            incoterm: 'FOB',
          },
        ],
      },
    ],
    charges: [
      { type: 'FREIGHT', basis: 'FIXED_AMOUNT', label: 'Ocean freight, 2 x 20ft', amount: '2400' },
      {
        type: 'INSURANCE',
        basis: 'PERCENTAGE',
        label: 'Marine insurance',
        rate: '0.35',
        amount: '0',
      },
      {
        type: 'INSPECTION',
        basis: 'FIXED_AMOUNT',
        label: 'Pre-shipment inspection',
        amount: '450',
      },
      {
        type: 'DISCOUNT',
        basis: 'PERCENTAGE',
        label: 'Volume discount, repeat buyer',
        rate: '1.5',
        amount: '0',
        isDeduction: true,
      },
    ],
    taxes: [
      {
        type: 'IGST',
        code: 'IGST-0',
        jurisdiction: 'IN-GJ',
        ratePercent: '0',
        isReverseCharge: false,
      },
    ],
    approvals: [
      { from: 'DRAFT', to: 'PENDING', comments: 'Submitted for margin review.' },
      { from: 'PENDING', to: 'APPROVED', comments: 'Margin above floor, approved.' },
    ],
    comments: [
      'Buyer asked us to hold the price for 30 days rather than 15 - agreed.',
      'Landed cost assumes INR 83.45; re-check if USD moves below 82.',
    ],
  },
  {
    quotationNumber: 'QT-2026-0002',
    type: 'BUDGETARY',
    title: 'Indicative offer - organic basmati rice',
    description: 'Budgetary estimate for planning only, subject to crop arrival and FX at booking.',
    currency: 'EUR',
    baseCurrency: 'INR',
    incoterm: 'FOB',
    destinationCountry: 'DE',
    destinationPort: 'Hamburg',
    paymentTermCode: 'LC_AT_SIGHT',
    status: 'DRAFT',
    validForDays: 14,
    leadTimeDays: 35,
    items: [
      {
        customProductName: 'Organic basmati rice, 1121 steam, 8.35mm',
        quantity: '24',
        unit: 'MT',
        unitCost: '1180.0000',
        unitPrice: '1490.0000',
        hsCode: '100630',
        countryOfOrigin: 'IN',
        packaging: '20 kg branded PP bags',
      },
    ],
    charges: [
      {
        type: 'PACKING',
        basis: 'PER_UNIT',
        label: 'Branded packing per MT',
        rate: '18',
        amount: '0',
      },
      { type: 'BANK_CHARGES', basis: 'FIXED_AMOUNT', label: 'LC handling', amount: '180' },
    ],
    taxes: [
      {
        type: 'VAT',
        code: 'DE-VAT-RC',
        jurisdiction: 'DE',
        ratePercent: '19',
        isReverseCharge: true,
      },
    ],
    approvals: [],
    comments: ['Indicative only - do not treat as a firm commitment.'],
  },
  {
    quotationNumber: 'QT-2026-0003',
    type: 'PROFORMA',
    title: 'Proforma invoice - dehydrated onion flakes',
    description: 'Proforma raised for the buyer to open an LC.',
    currency: 'USD',
    baseCurrency: 'INR',
    incoterm: 'FOB',
    destinationCountry: 'AE',
    destinationPort: 'Jebel Ali',
    paymentTermCode: 'NET_45',
    status: 'UNDER_NEGOTIATION',
    validForDays: 21,
    leadTimeDays: 28,
    items: [
      {
        customProductName: 'Dehydrated white onion flakes, kibbled',
        quantity: '12',
        unit: 'MT',
        unitCost: '1720.0000',
        unitPrice: '1980.0000',
        hsCode: '071220',
        countryOfOrigin: 'IN',
      },
    ],
    charges: [
      { type: 'FREIGHT', basis: 'FIXED_AMOUNT', label: 'Inland haulage', amount: '620' },
      {
        type: 'DISCOUNT',
        basis: 'FIXED_AMOUNT',
        label: 'Negotiated concession',
        amount: '400',
        isDeduction: true,
      },
    ],
    taxes: [{ type: 'IGST', code: 'IGST-0', jurisdiction: 'IN-MH', ratePercent: '0' }],
    approvals: [{ from: 'DRAFT', to: 'PENDING', comments: 'Buyer negotiating on price.' }],
    comments: ['Buyer counter-offered at 1920/MT; our margin floor is 1890/MT.'],
  },
]

const dec = (v: string) => v
const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000)

/**
 * Prices a seeded quotation with the same ordering the pricing engine uses, so
 * the persisted roll-ups agree with what the service would compute.
 */
function price(q: QuotationSeed) {
  const lines = q.items.map((it) => {
    const subtotal = Number(it.quantity) * Number(it.unitPrice)
    return {
      subtotal,
      cost: Number(it.quantity) * Number(it.unitCost),
      quantity: Number(it.quantity),
    }
  })
  const subtotal = lines.reduce((s, l) => s + l.subtotal, 0)
  const totalQuantity = lines.reduce((s, l) => s + l.quantity, 0)

  let running = subtotal
  let chargesTotal = 0
  let discountTotal = 0
  const resolvedCharges: Array<{ amount: number }> = []
  for (const c of q.charges) {
    let amount: number
    if (c.basis === 'PERCENTAGE') amount = (running * Number(c.rate ?? '0')) / 100
    else if (c.basis === 'PER_UNIT') amount = Number(c.rate ?? '0') * totalQuantity
    else amount = Number(c.amount)
    amount = Math.round(amount * 10_000) / 10_000
    resolvedCharges.push({ amount })
    if (c.isDeduction) {
      discountTotal += amount
      running -= amount
    } else {
      chargesTotal += amount
      running += amount
    }
  }

  let taxTotal = 0
  const resolvedTaxes: Array<{ taxableAmount: number; amount: number }> = []
  for (const t of q.taxes) {
    const amount = Math.round(((running * Number(t.ratePercent)) / 100) * 10_000) / 10_000
    resolvedTaxes.push({ taxableAmount: running, amount })
    // Reverse charge is recorded but not collected by the seller.
    if (!t.isReverseCharge) taxTotal += amount
  }

  const costTotal = lines.reduce((s, l) => s + l.cost, 0)
  const round = (n: number) => Math.round(n * 10_000) / 10_000
  return {
    lineSubtotals: lines.map((l) => round(l.subtotal)),
    subtotal: round(subtotal),
    chargesTotal: round(chargesTotal),
    discountTotal: round(discountTotal),
    taxTotal: round(taxTotal),
    grandTotal: round(running + taxTotal),
    costTotal: round(costTotal),
    marginPercent: subtotal > 0 ? round(((subtotal - costTotal) / subtotal) * 100) : null,
    charges: resolvedCharges,
    taxes: resolvedTaxes,
  }
}

export async function seedQuotations(prisma: PrismaClient, organizationId: string) {
  const user = await prisma.user.findFirst({ where: { organizationId }, select: { id: true } })
  const actorId = user?.id ?? 'seed'

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

  // Every quotation needs a buyer Account. The RFQ seed creates one; reuse it
  // rather than adding a second buyer for the same tenant.
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

  // ---- Payment terms ----
  const termByCode = new Map<string, string>()
  for (const [i, t] of PAYMENT_TERMS.entries()) {
    const term = await prisma.paymentTerm.upsert({
      where: { organizationId_code: { organizationId, code: t.code } },
      update: { name: t.name, netDays: t.netDays, advancePercent: dec(String(t.advance)) },
      create: {
        organizationId,
        code: t.code,
        name: t.name,
        netDays: t.netDays,
        advancePercent: dec(String(t.advance)),
        sortOrder: i,
      },
      select: { id: true },
    })
    termByCode.set(t.code, term.id)
  }

  // ---- Exchange rates ----
  // One open-ended window per pair. The EXCLUDE constraint forbids overlapping
  // windows, so the window start is fixed rather than derived from "now".
  const rateFrom = new Date('2026-01-01T00:00:00.000Z')
  let rates = 0
  for (const r of EXCHANGE_RATES) {
    const existing = await prisma.exchangeRate.findFirst({
      where: {
        organizationId,
        fromCurrency: r.from,
        toCurrency: r.to,
        effectiveFrom: rateFrom,
      },
      select: { id: true },
    })
    if (existing) {
      await prisma.exchangeRate.update({ where: { id: existing.id }, data: { rate: dec(r.rate) } })
    } else {
      await prisma.exchangeRate.create({
        data: {
          organizationId,
          fromCurrency: r.from,
          toCurrency: r.to,
          rate: dec(r.rate),
          effectiveFrom: rateFrom,
          source: 'RBI',
          createdById: actorId,
        },
      })
    }
    rates += 1
  }

  const rateFor = (currency: string, base: string) =>
    currency === base ? '1' : (EXCHANGE_RATES.find((r) => r.from === currency)?.rate ?? '1')

  // ---- Quotations ----
  let seeded = 0
  let options = 0
  for (const q of QUOTATIONS) {
    const totals = price(q)
    const validFrom = new Date('2026-02-01T00:00:00.000Z')

    // rfqItemId gives each line its provenance. Missing RFQ lines are left null
    // rather than skipped, so a quotation is never silently dropped.
    const rfqItemByLine = new Map<number, string>()
    let primaryRfqId: string | null = null
    if (q.fromRfqNumber) {
      const rfq = await prisma.rFQ.findFirst({
        where: { organizationId, rfqNumber: q.fromRfqNumber },
        select: { id: true, items: { select: { id: true, lineNumber: true } } },
      })
      if (rfq) {
        primaryRfqId = rfq.id
        for (const it of rfq.items) rfqItemByLine.set(it.lineNumber, it.id)
      }
    }

    const existing = await prisma.quotation.findUnique({
      where: {
        organizationId_quotationNumber_revisionNumber: {
          organizationId,
          quotationNumber: q.quotationNumber,
          revisionNumber: 1,
        },
      },
      select: { id: true },
    })

    const header = {
      organizationId,
      quotationNumber: q.quotationNumber,
      revisionNumber: 1,
      type: q.type,
      status: q.status,
      buyerId: account.id,
      primaryRfqId,
      title: q.title,
      description: q.description,
      currency: q.currency,
      baseCurrency: q.baseCurrency,
      fxRate: dec(rateFor(q.currency, q.baseCurrency)),
      fxRateDate: rateFrom,
      incoterm: q.incoterm,
      destinationCountry: q.destinationCountry,
      destinationPort: q.destinationPort,
      paymentTermId: termByCode.get(q.paymentTermCode) ?? null,
      leadTimeDays: q.leadTimeDays,
      validFrom,
      validUntil: daysFromNow(q.validForDays),
      subtotal: dec(String(totals.subtotal)),
      chargesTotal: dec(String(totals.chargesTotal)),
      discountTotal: dec(String(totals.discountTotal)),
      taxTotal: dec(String(totals.taxTotal)),
      grandTotal: dec(String(totals.grandTotal)),
      costTotal: dec(String(totals.costTotal)),
      marginPercent: totals.marginPercent === null ? null : dec(String(totals.marginPercent)),
      ...(q.status === 'SENT' || q.status === 'UNDER_NEGOTIATION' ? { sentAt: validFrom } : {}),
      createdById: actorId,
      updatedById: actorId,
    }

    const quotation = existing
      ? await prisma.quotation.update({
          where: { id: existing.id },
          data: header,
          select: { id: true },
        })
      : await prisma.quotation.create({ data: header, select: { id: true } })

    // Owned collections are replaced wholesale so a re-run is a clean state.
    await prisma.quotationItem.deleteMany({ where: { quotationId: quotation.id } })
    await prisma.quotationCharge.deleteMany({ where: { quotationId: quotation.id } })
    await prisma.quotationTax.deleteMany({ where: { quotationId: quotation.id } })
    await prisma.quotationComment.deleteMany({ where: { quotationId: quotation.id } })
    await prisma.quotationApproval.deleteMany({ where: { quotationId: quotation.id } })
    await prisma.quotationRevision.deleteMany({ where: { quotationId: quotation.id } })

    for (const [i, it] of q.items.entries()) {
      const lineNumber = i + 1
      const lineSubtotal = totals.lineSubtotals[i] ?? 0
      const item = await prisma.quotationItem.create({
        data: {
          quotationId: quotation.id,
          organizationId,
          lineNumber,
          productId: it.sku ? (productBySku.get(it.sku) ?? null) : null,
          // A catalog line carries no custom name; the CHECK requires one or
          // the other, never both and never neither.
          customProductName: it.sku ? null : (it.customProductName ?? 'Unnamed line'),
          rfqItemId: rfqItemByLine.get(lineNumber) ?? null,
          quantity: dec(it.quantity),
          unit: it.unit,
          unitCost: dec(it.unitCost),
          unitPrice: dec(it.unitPrice),
          lineSubtotal: dec(String(lineSubtotal)),
          lineTotal: dec(String(lineSubtotal)),
          hsCode: it.hsCode,
          countryOfOrigin: it.countryOfOrigin,
          packaging: it.packaging,
        },
        select: { id: true },
      })

      // Rank by landed cost; the selected option is not always rank 1, which is
      // the point of recording selectionReason.
      const ranked = [...(it.options ?? [])].sort(
        (a, b) => Number(a.landedUnitCost) - Number(b.landedUnitCost),
      )
      for (const [j, o] of ranked.entries()) {
        const supplierId = supplierByCode.get(o.supplierCode)
        if (!supplierId) continue
        await prisma.quotationSourceOption.create({
          data: {
            quotationItemId: item.id,
            organizationId,
            supplierId,
            supplierPrice: dec(o.supplierPrice),
            supplierCurrency: o.supplierCurrency,
            fxRate: dec(rateFor(o.supplierCurrency, q.baseCurrency)),
            landedUnitCost: dec(o.landedUnitCost),
            leadTimeDays: o.leadTimeDays,
            incoterm: o.incoterm,
            rank: j + 1,
            isSelected: o.isSelected ?? false,
            selectionReason: o.selectionReason,
            ...(o.isSelected ? { selectedById: actorId, selectedAt: validFrom } : {}),
          },
        })
        options += 1
      }
    }

    for (const [i, c] of q.charges.entries()) {
      await prisma.quotationCharge.create({
        data: {
          quotationId: quotation.id,
          organizationId,
          type: c.type,
          scope: 'HEADER',
          basis: c.basis,
          label: c.label,
          rate: c.rate === undefined ? null : dec(c.rate),
          amount: dec(String(totals.charges[i]?.amount ?? 0)),
          currency: q.currency,
          isDeduction: c.isDeduction ?? c.type === 'DISCOUNT',
          sequence: i,
        },
      })
    }

    for (const [i, t] of q.taxes.entries()) {
      await prisma.quotationTax.create({
        data: {
          quotationId: quotation.id,
          organizationId,
          type: t.type,
          code: t.code,
          jurisdiction: t.jurisdiction,
          ratePercent: dec(t.ratePercent),
          taxableAmount: dec(String(totals.taxes[i]?.taxableAmount ?? 0)),
          amount: dec(String(totals.taxes[i]?.amount ?? 0)),
          currency: q.currency,
          isReverseCharge: t.isReverseCharge ?? false,
          sequence: i,
        },
      })
    }

    for (const [i, a] of q.approvals.entries()) {
      await prisma.quotationApproval.create({
        data: {
          quotationId: quotation.id,
          organizationId,
          fromStatus: a.from,
          toStatus: a.to,
          sequence: i + 1,
          approverId: actorId,
          comments: a.comments,
          thresholdAmount: dec('1000000'),
          marginPercent: totals.marginPercent === null ? null : dec(String(totals.marginPercent)),
        },
      })
    }

    for (const body of q.comments) {
      await prisma.quotationComment.create({
        data: { quotationId: quotation.id, organizationId, authorId: actorId, body },
      })
    }

    await prisma.quotationRevision.create({
      data: {
        quotationId: quotation.id,
        organizationId,
        // Quotation revisions fork per document, so the revision row records the
        // hop rather than a single number: null -> 1 is the opening issue.
        fromRevision: null,
        toRevision: 1,
        reason: 'Initial issue.',
        changeSummary: {
          lines: q.items.length,
          grandTotal: totals.grandTotal,
          currency: q.currency,
        },
        changedById: actorId,
      },
    })

    seeded += 1
  }

  return { quotations: seeded, paymentTerms: PAYMENT_TERMS.length, exchangeRates: rates, options }
}
