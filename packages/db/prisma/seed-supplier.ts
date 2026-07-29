import type { PrismaClient } from '@prisma/client'

// Supplier Management seed (TRY-BNP-SUPPLIER-02).
//
// Idempotent: suppliers are upserted on their tenant-scoped code, and every
// owned collection is replaced wholesale so re-running never duplicates rows and
// never trips the one-primary or non-overlapping-capacity constraints.

const CAPACITY_FROM = new Date('2026-01-01T00:00:00.000Z')

type SupplierSeed = {
  supplierCode: string
  companyName: string
  legalName: string
  businessType:
    'MANUFACTURER' | 'MANUFACTURER_EXPORTER' | 'MERCHANT_EXPORTER' | 'TRADER' | 'PROCESSOR'
  email: string
  phone: string
  website?: string
  gstNumber?: string
  iecNumber?: string
  panNumber?: string
  country: string
  state: string
  city: string
  status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED'
  isVerified: boolean
  tagSlugs: string[]
  contacts: Array<{
    name: string
    role: 'OWNER' | 'SALES' | 'EXPORT_MANAGER' | 'ACCOUNTS' | 'QUALITY'
    designation: string
    email: string
    phone: string
    isPrimary: boolean
  }>
  addresses: Array<{
    type: 'REGISTERED_OFFICE' | 'FACTORY' | 'WAREHOUSE'
    line1: string
    city: string
    state: string
    postalCode: string
    country: string
    isPrimary: boolean
    factorySizeSqm?: number
    productionLines?: number
    employeeCount?: number
    establishedYear?: number
  }>
  bankAccounts: Array<{
    bankName: string
    branchName: string
    accountHolderName: string
    accountNumber: string
    ifscCode: string
    swiftCode?: string
    currency: string
    isPrimary: boolean
  }>
  certifications: Array<{
    type: 'ISO' | 'FSSAI' | 'HACCP' | 'APEDA' | 'ORGANIC' | 'HALAL' | 'SPICE_BOARD'
    certificateNumber: string
    issuedBy: string
    issuedDate: Date
    expiryDate: Date
    scope?: string
  }>
  documents: Array<{
    type: 'GST' | 'IEC' | 'PAN' | 'MSME' | 'FACTORY_LICENSE' | 'COMPANY_PROFILE'
    title: string
    documentNumber?: string
  }>
  /** Catalog SKUs this supplier offers. */
  offerings: Array<{
    sku: string
    supplierSku: string
    moq: string
    leadTimeDays: number
    price: string
    currency: string
    incoterm: 'FOB' | 'CIF' | 'EXW'
    port: string
    isPreferred: boolean
  }>
  capacities: Array<{
    sku?: string
    capacity: string
    unit: string
    frequency: 'PER_DAY' | 'PER_MONTH'
  }>
  performance?: {
    periodStart: Date
    periodEnd: Date
    delivery: string
    quality: string
    communication: string
    documentation: string
    responsiveness: string
    overall: string
  }
}

const SUPPLIERS: SupplierSeed[] = [
  {
    supplierCode: 'SUP-000001',
    companyName: 'Nizam Spice Processors',
    legalName: 'Nizam Spice Processors Private Limited',
    businessType: 'MANUFACTURER_EXPORTER',
    email: 'exports@nizamspice.test',
    phone: '+91-98490-11111',
    website: 'https://nizamspice.test',
    gstNumber: '36AABCN1234M1Z5',
    iecNumber: 'AABCN1234M',
    panNumber: 'AABCN1234M',
    country: 'IN',
    state: 'Telangana',
    city: 'Nizamabad',
    status: 'APPROVED',
    isVerified: true,
    tagSlugs: ['premium', 'export-quality'],
    contacts: [
      {
        name: 'Rajesh Kumar',
        role: 'OWNER',
        designation: 'Managing Director',
        email: 'rajesh@nizamspice.test',
        phone: '+91-98490-11112',
        isPrimary: true,
      },
      {
        name: 'Priya Sharma',
        role: 'EXPORT_MANAGER',
        designation: 'Sr. Manager - Exports',
        email: 'priya@nizamspice.test',
        phone: '+91-98490-11113',
        isPrimary: false,
      },
    ],
    addresses: [
      {
        type: 'REGISTERED_OFFICE',
        line1: '12-4-88, Subhash Road',
        city: 'Nizamabad',
        state: 'Telangana',
        postalCode: '503001',
        country: 'IN',
        isPrimary: true,
      },
      {
        type: 'FACTORY',
        line1: 'Plot 44, Industrial Estate Phase II',
        city: 'Nizamabad',
        state: 'Telangana',
        postalCode: '503003',
        country: 'IN',
        isPrimary: false,
        factorySizeSqm: 8500,
        productionLines: 4,
        employeeCount: 120,
        establishedYear: 2009,
      },
    ],
    bankAccounts: [
      {
        bankName: 'State Bank of India',
        branchName: 'Nizamabad Main',
        accountHolderName: 'Nizam Spice Processors Private Limited',
        accountNumber: '30000000001',
        ifscCode: 'SBIN0001234',
        swiftCode: 'SBININBB250',
        currency: 'INR',
        isPrimary: true,
      },
    ],
    certifications: [
      {
        type: 'ISO',
        certificateNumber: 'ISO-22000-2024-8841',
        issuedBy: 'TUV India',
        issuedDate: new Date('2024-04-01T00:00:00.000Z'),
        expiryDate: new Date('2027-03-31T00:00:00.000Z'),
        scope: 'Unit II - spice grinding and packing',
      },
      {
        type: 'FSSAI',
        certificateNumber: '10018043002345',
        issuedBy: 'FSSAI',
        issuedDate: new Date('2023-06-15T00:00:00.000Z'),
        expiryDate: new Date('2028-06-14T00:00:00.000Z'),
      },
      {
        type: 'SPICE_BOARD',
        certificateNumber: 'SB/EXP/2024/1187',
        issuedBy: 'Spices Board India',
        issuedDate: new Date('2024-01-10T00:00:00.000Z'),
        expiryDate: new Date('2027-01-09T00:00:00.000Z'),
      },
    ],
    documents: [
      { type: 'GST', title: 'GST Registration Certificate', documentNumber: '36AABCN1234M1Z5' },
      { type: 'IEC', title: 'Import Export Code', documentNumber: 'AABCN1234M' },
      { type: 'FACTORY_LICENSE', title: 'Factory Licence' },
    ],
    offerings: [
      {
        sku: 'TRY-TUR-001',
        supplierSku: 'NSP-TURM-80',
        moq: '18',
        leadTimeDays: 21,
        price: '1720.0000',
        currency: 'USD',
        incoterm: 'FOB',
        port: 'Nhava Sheva',
        isPreferred: true,
      },
      {
        sku: 'TRY-CHI-001',
        supplierSku: 'NSP-CHIL-60',
        moq: '15',
        leadTimeDays: 21,
        price: '2100.0000',
        currency: 'USD',
        incoterm: 'FOB',
        port: 'Chennai',
        isPreferred: false,
      },
    ],
    capacities: [
      { capacity: '500', unit: 'MT', frequency: 'PER_MONTH' },
      { sku: 'TRY-TUR-001', capacity: '10', unit: 'MT', frequency: 'PER_DAY' },
    ],
    performance: {
      periodStart: new Date('2026-01-01T00:00:00.000Z'),
      periodEnd: new Date('2026-03-31T00:00:00.000Z'),
      delivery: '92.50',
      quality: '95.00',
      communication: '88.00',
      documentation: '90.00',
      responsiveness: '87.50',
      overall: '91.20',
    },
  },
  {
    supplierCode: 'SUP-000002',
    companyName: 'Nashik Dehydrates',
    legalName: 'Nashik Dehydrates LLP',
    businessType: 'PROCESSOR',
    email: 'sales@nashikdehydrates.test',
    phone: '+91-99220-22222',
    gstNumber: '27AACFN5678P1Z2',
    iecNumber: 'AACFN5678P',
    panNumber: 'AACFN5678P',
    country: 'IN',
    state: 'Maharashtra',
    city: 'Nashik',
    status: 'APPROVED',
    isVerified: true,
    tagSlugs: ['export-quality'],
    contacts: [
      {
        name: 'Anil Deshmukh',
        role: 'SALES',
        designation: 'Head of Sales',
        email: 'anil@nashikdehydrates.test',
        phone: '+91-99220-22223',
        isPrimary: true,
      },
    ],
    addresses: [
      {
        type: 'FACTORY',
        line1: 'Gat No. 210, Dindori Road',
        city: 'Nashik',
        state: 'Maharashtra',
        postalCode: '422004',
        country: 'IN',
        isPrimary: true,
        factorySizeSqm: 12000,
        productionLines: 6,
        employeeCount: 180,
        establishedYear: 2014,
      },
    ],
    bankAccounts: [
      {
        bankName: 'HDFC Bank',
        branchName: 'Nashik Road',
        accountHolderName: 'Nashik Dehydrates LLP',
        accountNumber: '50100000002',
        ifscCode: 'HDFC0000456',
        currency: 'INR',
        isPrimary: true,
      },
    ],
    certifications: [
      {
        type: 'HACCP',
        certificateNumber: 'HACCP-2025-3312',
        issuedBy: 'SGS India',
        issuedDate: new Date('2025-02-01T00:00:00.000Z'),
        expiryDate: new Date('2028-01-31T00:00:00.000Z'),
      },
      {
        type: 'APEDA',
        certificateNumber: 'APEDA/RCMC/2024/8890',
        issuedBy: 'APEDA',
        issuedDate: new Date('2024-05-20T00:00:00.000Z'),
        expiryDate: new Date('2029-05-19T00:00:00.000Z'),
      },
    ],
    documents: [
      { type: 'GST', title: 'GST Registration Certificate', documentNumber: '27AACFN5678P1Z2' },
      { type: 'MSME', title: 'Udyam Registration' },
    ],
    offerings: [
      {
        sku: 'TRY-ONI-001',
        supplierSku: 'ND-ONP-100',
        moq: '12',
        leadTimeDays: 18,
        price: '2280.0000',
        currency: 'USD',
        incoterm: 'FOB',
        port: 'Nhava Sheva',
        isPreferred: true,
      },
      {
        sku: 'TRY-GAR-001',
        supplierSku: 'ND-GARF-A',
        moq: '10',
        leadTimeDays: 20,
        price: '2760.0000',
        currency: 'USD',
        incoterm: 'FOB',
        port: 'Mundra',
        isPreferred: false,
      },
    ],
    capacities: [{ capacity: '350', unit: 'MT', frequency: 'PER_MONTH' }],
    performance: {
      periodStart: new Date('2026-01-01T00:00:00.000Z'),
      periodEnd: new Date('2026-03-31T00:00:00.000Z'),
      delivery: '88.00',
      quality: '91.00',
      communication: '93.00',
      documentation: '85.00',
      responsiveness: '90.00',
      overall: '89.40',
    },
  },
  {
    supplierCode: 'SUP-000003',
    companyName: 'Gujarat Seed Traders',
    legalName: 'Gujarat Seed Traders',
    businessType: 'TRADER',
    email: 'info@gujaratseed.test',
    phone: '+91-98250-33333',
    country: 'IN',
    state: 'Gujarat',
    city: 'Unjha',
    status: 'PENDING_REVIEW',
    isVerified: false,
    tagSlugs: ['new-arrival'],
    contacts: [
      {
        name: 'Mehul Patel',
        role: 'OWNER',
        designation: 'Proprietor',
        email: 'mehul@gujaratseed.test',
        phone: '+91-98250-33334',
        isPrimary: true,
      },
    ],
    addresses: [
      {
        type: 'REGISTERED_OFFICE',
        line1: 'Shop 18, APMC Market Yard',
        city: 'Unjha',
        state: 'Gujarat',
        postalCode: '384170',
        country: 'IN',
        isPrimary: true,
      },
    ],
    bankAccounts: [],
    certifications: [],
    documents: [{ type: 'COMPANY_PROFILE', title: 'Company Profile 2026' }],
    offerings: [
      {
        sku: 'TRY-CUM-001',
        supplierSku: 'GST-CUM-99',
        moq: '19',
        leadTimeDays: 15,
        price: '2980.0000',
        currency: 'USD',
        incoterm: 'FOB',
        port: 'Mundra',
        isPreferred: true,
      },
    ],
    capacities: [{ capacity: '120', unit: 'MT', frequency: 'PER_MONTH' }],
  },
]

export async function seedSuppliers(prisma: PrismaClient, organizationId: string) {
  const products = await prisma.product.findMany({
    where: { organizationId },
    select: { id: true, sku: true },
  })
  const productBySku = new Map(products.map((p) => [p.sku, p.id]))

  const tags = await prisma.tag.findMany({
    where: { organizationId },
    select: { id: true, slug: true },
  })
  const tagBySlug = new Map(tags.map((t) => [t.slug, t.id]))

  const admin = await prisma.user.findFirst({ where: { organizationId }, select: { id: true } })
  const actorId = admin?.id ?? 'seed'

  for (const s of SUPPLIERS) {
    const supplier = await prisma.supplier.upsert({
      where: { organizationId_supplierCode: { organizationId, supplierCode: s.supplierCode } },
      update: {
        companyName: s.companyName,
        legalName: s.legalName,
        businessType: s.businessType,
        email: s.email,
        phone: s.phone,
        website: s.website,
        gstNumber: s.gstNumber,
        iecNumber: s.iecNumber,
        panNumber: s.panNumber,
        country: s.country,
        state: s.state,
        city: s.city,
        status: s.status,
        isVerified: s.isVerified,
      },
      create: {
        organizationId,
        supplierCode: s.supplierCode,
        companyName: s.companyName,
        legalName: s.legalName,
        businessType: s.businessType,
        email: s.email,
        phone: s.phone,
        website: s.website,
        gstNumber: s.gstNumber,
        iecNumber: s.iecNumber,
        panNumber: s.panNumber,
        country: s.country,
        state: s.state,
        city: s.city,
        status: s.status,
        isVerified: s.isVerified,
        verifiedAt: s.isVerified ? new Date() : null,
        createdById: actorId,
      },
    })

    // Owned collections are replaced wholesale, which keeps the seed idempotent
    // and cannot violate the one-primary or non-overlapping-capacity rules.
    await prisma.supplierContact.deleteMany({ where: { supplierId: supplier.id } })
    await prisma.supplierAddress.deleteMany({ where: { supplierId: supplier.id } })
    await prisma.supplierBankAccount.deleteMany({ where: { supplierId: supplier.id } })
    await prisma.supplierCertification.deleteMany({ where: { supplierId: supplier.id } })
    await prisma.supplierDocument.deleteMany({ where: { supplierId: supplier.id } })
    await prisma.supplierProductOffering.deleteMany({ where: { supplierId: supplier.id } })
    await prisma.supplierCapacity.deleteMany({ where: { supplierId: supplier.id } })
    await prisma.supplierPerformance.deleteMany({ where: { supplierId: supplier.id } })
    await prisma.supplierApproval.deleteMany({ where: { supplierId: supplier.id } })
    await prisma.supplierTag.deleteMany({ where: { supplierId: supplier.id } })

    await prisma.supplierContact.createMany({
      data: s.contacts.map((c, i) => ({
        supplierId: supplier.id,
        organizationId,
        ...c,
        sortOrder: i * 10,
      })),
    })

    // Addresses are created one at a time because capacities reference them.
    const addressIds: string[] = []
    for (const a of s.addresses) {
      const row = await prisma.supplierAddress.create({
        data: { supplierId: supplier.id, organizationId, ...a },
        select: { id: true, type: true },
      })
      if (row.type === 'FACTORY') addressIds.push(row.id)
    }

    await prisma.supplierBankAccount.createMany({
      data: s.bankAccounts.map((b) => ({ supplierId: supplier.id, organizationId, ...b })),
    })

    const docIds = new Map<string, string>()
    for (const d of s.documents) {
      const row = await prisma.supplierDocument.create({
        data: {
          supplierId: supplier.id,
          organizationId,
          type: d.type,
          title: d.title,
          documentNumber: d.documentNumber,
          fileUrl: `https://cdn.triyaraexports.com/suppliers/${s.supplierCode}/${d.type.toLowerCase()}.pdf`,
          mimeType: 'application/pdf',
        },
        select: { id: true, type: true },
      })
      docIds.set(row.type, row.id)
    }

    await prisma.supplierCertification.createMany({
      data: s.certifications.map((c) => ({
        supplierId: supplier.id,
        organizationId,
        type: c.type,
        certificateNumber: c.certificateNumber,
        issuedBy: c.issuedBy,
        issuedDate: c.issuedDate,
        expiryDate: c.expiryDate,
        scope: c.scope,
        status: 'ACTIVE' as const,
      })),
    })

    const offerings = s.offerings.filter((o) => productBySku.has(o.sku))
    await prisma.supplierProductOffering.createMany({
      data: offerings.map((o) => ({
        supplierId: supplier.id,
        organizationId,
        productId: productBySku.get(o.sku)!,
        supplierSku: o.supplierSku,
        moq: o.moq,
        moqUnit: 'MT',
        leadTimeDays: o.leadTimeDays,
        isPreferred: o.isPreferred,
        price: o.price,
        currency: o.currency,
        incoterm: o.incoterm,
        port: o.port,
        status: 'ACTIVE' as const,
      })),
    })

    await prisma.supplierCapacity.createMany({
      data: s.capacities.map((c) => ({
        supplierId: supplier.id,
        organizationId,
        productId: c.sku ? (productBySku.get(c.sku) ?? null) : null,
        addressId: addressIds[0] ?? null,
        capacity: c.capacity,
        unit: c.unit,
        frequency: c.frequency,
        effectiveFrom: CAPACITY_FROM,
      })),
    })

    if (s.performance) {
      await prisma.supplierPerformance.create({
        data: {
          supplierId: supplier.id,
          organizationId,
          periodStart: s.performance.periodStart,
          periodEnd: s.performance.periodEnd,
          deliveryScore: s.performance.delivery,
          qualityScore: s.performance.quality,
          communicationScore: s.performance.communication,
          documentationScore: s.performance.documentation,
          responsivenessScore: s.performance.responsiveness,
          overallScore: s.performance.overall,
          source: 'COMPUTED',
          computedAt: new Date(),
        },
      })
    }

    if (s.status === 'APPROVED') {
      await prisma.supplierApproval.createMany({
        data: [
          {
            supplierId: supplier.id,
            organizationId,
            fromStatus: 'DRAFT',
            toStatus: 'PENDING_REVIEW',
            decision: 'SUBMITTED',
            reviewerId: actorId,
          },
          {
            supplierId: supplier.id,
            organizationId,
            fromStatus: 'PENDING_REVIEW',
            toStatus: 'APPROVED',
            decision: 'APPROVED',
            reviewerId: actorId,
            comments: 'Documents and certifications verified.',
          },
        ],
      })
    }

    const tagIds = s.tagSlugs.map((slug) => tagBySlug.get(slug)).filter((id): id is string => !!id)
    await prisma.supplierTag.createMany({
      data: tagIds.map((tagId) => ({ supplierId: supplier.id, tagId })),
    })
  }

  return { suppliers: SUPPLIERS.length }
}
