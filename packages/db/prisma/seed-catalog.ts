import type {
  DataType,
  Incoterm,
  PrismaClient,
  ProductDocumentType,
  ProductStatus,
} from '@prisma/client'

// Product Catalog seed (TRY-BNP-CATALOG-S1).
//
// Idempotent: aggregate roots are upserted on their tenant-scoped unique keys,
// and each product's owned collections (specs, images, documents, prices, tags)
// are replaced wholesale so re-running never duplicates rows and never trips the
// one-PRIMARY-image or non-overlapping-price constraints.

const PRICE_VALID_FROM = new Date('2026-01-01T00:00:00.000Z')

type CategorySeed = {
  slug: string
  name: string
  description?: string
  parentSlug?: string
  sortOrder: number
}

// Ordered parents-first so each row's parent already exists when it is created.
const CATEGORIES: CategorySeed[] = [
  { slug: 'spices', name: 'Spices', description: 'Whole and ground spices.', sortOrder: 10 },
  { slug: 'whole-spices', name: 'Whole Spices', parentSlug: 'spices', sortOrder: 10 },
  { slug: 'ground-spices', name: 'Ground Spices', parentSlug: 'spices', sortOrder: 20 },
  { slug: 'seed-spices', name: 'Seed Spices', parentSlug: 'whole-spices', sortOrder: 10 },
  {
    slug: 'dehydrated-vegetables',
    name: 'Dehydrated Vegetables',
    description: 'Air- and drum-dried vegetable products.',
    sortOrder: 20,
  },
  { slug: 'dehydrated-onion', name: 'Onion', parentSlug: 'dehydrated-vegetables', sortOrder: 10 },
  { slug: 'dehydrated-garlic', name: 'Garlic', parentSlug: 'dehydrated-vegetables', sortOrder: 20 },
  { slug: 'oil-seeds', name: 'Oil Seeds', sortOrder: 30 },
]

type SpecSeed = {
  slug: string
  name: string
  unit?: string
  dataType: DataType
  allowedValues?: string[]
  isFilterable?: boolean
  sortOrder: number
}

const SPEC_DEFINITIONS: SpecSeed[] = [
  {
    slug: 'moisture',
    name: 'Moisture',
    unit: '%',
    dataType: 'NUMBER',
    isFilterable: true,
    sortOrder: 10,
  },
  {
    slug: 'purity',
    name: 'Purity',
    unit: '%',
    dataType: 'NUMBER',
    isFilterable: true,
    sortOrder: 20,
  },
  {
    slug: 'curcumin',
    name: 'Curcumin',
    unit: '%',
    dataType: 'NUMBER',
    isFilterable: true,
    sortOrder: 30,
  },
  {
    slug: 'mesh',
    name: 'Mesh',
    unit: 'mesh',
    dataType: 'NUMBER',
    isFilterable: true,
    sortOrder: 40,
  },
  {
    slug: 'grade',
    name: 'Grade',
    dataType: 'ENUM',
    allowedValues: ['A', 'B', 'C'],
    isFilterable: true,
    sortOrder: 50,
  },
  { slug: 'color', name: 'Color', dataType: 'STRING', sortOrder: 60 },
  { slug: 'shelf-life', name: 'Shelf Life', unit: 'months', dataType: 'NUMBER', sortOrder: 70 },
  { slug: 'packing', name: 'Packing', dataType: 'STRING', sortOrder: 80 },
  { slug: 'origin', name: 'Origin', dataType: 'STRING', sortOrder: 90 },
  { slug: 'container-capacity', name: 'Container Capacity', dataType: 'STRING', sortOrder: 100 },
  { slug: 'lead-time', name: 'Lead Time', unit: 'days', dataType: 'NUMBER', sortOrder: 110 },
]

const TAGS = [
  { slug: 'organic', name: 'Organic', color: '#15803D', sortOrder: 10 },
  { slug: 'premium', name: 'Premium', color: '#B45309', sortOrder: 20 },
  { slug: 'export-quality', name: 'Export Quality', color: '#0F766E', sortOrder: 30 },
  { slug: 'best-seller', name: 'Best Seller', color: '#B91C1C', sortOrder: 40 },
  { slug: 'new-arrival', name: 'New Arrival', color: '#4338CA', sortOrder: 50 },
]

type ProductSeed = {
  sku: string
  name: string
  slug: string
  shortDescription: string
  description: string
  categorySlug: string
  brand: string
  hsCode: string
  countryOfOrigin: string
  status: ProductStatus
  specs: Array<{ slug: string; value: string }>
  tags: string[]
  images: Array<{ url: string; altText: string; type: 'PRIMARY' | 'GALLERY'; sortOrder: number }>
  documents: Array<{
    documentType: ProductDocumentType
    title: string
    fileUrl: string
    version?: string
    validUntil?: Date
    isPublic?: boolean
  }>
  prices: Array<{
    currency: string
    price: string
    incoterm: Incoterm
    port?: string
    minimumOrderQty?: string
    unit?: string
  }>
}

const PRODUCTS: ProductSeed[] = [
  {
    sku: 'TRY-TUR-001',
    name: 'Turmeric Powder',
    slug: 'turmeric-powder',
    shortDescription: 'Single-origin Nizamabad turmeric, high curcumin, steam sterilised.',
    description:
      'Ground from Nizamabad finger turmeric and milled to 80 mesh. Steam sterilised, metal detected and packed in food-grade liners. Typical curcumin 3.5%, suitable for retail and industrial buyers.',
    categorySlug: 'ground-spices',
    brand: 'Triyara',
    hsCode: '09103020',
    countryOfOrigin: 'IN',
    status: 'ACTIVE',
    specs: [
      { slug: 'curcumin', value: '3.5' },
      { slug: 'moisture', value: '8' },
      { slug: 'mesh', value: '80' },
      { slug: 'grade', value: 'A' },
      { slug: 'color', value: 'Deep Yellow' },
      { slug: 'shelf-life', value: '24' },
      { slug: 'packing', value: '25 kg PP bag with inner liner' },
      { slug: 'origin', value: 'Nizamabad, Telangana' },
      { slug: 'container-capacity', value: '18 MT / 20ft FCL' },
      { slug: 'lead-time', value: '21' },
    ],
    tags: ['premium', 'export-quality', 'best-seller'],
    images: [
      {
        url: 'https://cdn.triyaraexports.com/catalog/turmeric-powder/primary.jpg',
        altText: 'Deep yellow turmeric powder in a bulk export sack',
        type: 'PRIMARY',
        sortOrder: 0,
      },
      {
        url: 'https://cdn.triyaraexports.com/catalog/turmeric-powder/packing.jpg',
        altText: '25 kg PP bags stacked for container loading',
        type: 'GALLERY',
        sortOrder: 10,
      },
    ],
    documents: [
      {
        documentType: 'COA',
        title: 'Certificate of Analysis - Turmeric Powder',
        fileUrl: 'https://cdn.triyaraexports.com/docs/turmeric-powder/coa.pdf',
        version: 'Rev-3',
        validUntil: new Date('2027-06-30T00:00:00.000Z'),
        isPublic: true,
      },
      {
        documentType: 'SPEC_SHEET',
        title: 'Technical Specification Sheet',
        fileUrl: 'https://cdn.triyaraexports.com/docs/turmeric-powder/spec.pdf',
        isPublic: true,
      },
      {
        documentType: 'FSSAI',
        title: 'FSSAI Licence',
        fileUrl: 'https://cdn.triyaraexports.com/docs/fssai-licence.pdf',
        validUntil: new Date('2028-03-31T00:00:00.000Z'),
      },
    ],
    prices: [
      {
        currency: 'USD',
        price: '1850.0000',
        incoterm: 'FOB',
        port: 'Nhava Sheva',
        minimumOrderQty: '18',
        unit: 'MT',
      },
      {
        currency: 'USD',
        price: '1920.0000',
        incoterm: 'FOB',
        port: 'Mumbai',
        minimumOrderQty: '18',
        unit: 'MT',
      },
      {
        currency: 'USD',
        price: '2050.0000',
        incoterm: 'CIF',
        port: 'Dubai',
        minimumOrderQty: '18',
        unit: 'MT',
      },
      {
        currency: 'EUR',
        price: '2210.0000',
        incoterm: 'CIF',
        port: 'Rotterdam',
        minimumOrderQty: '18',
        unit: 'MT',
      },
      {
        currency: 'INR',
        price: '148000.0000',
        incoterm: 'EXW',
        port: 'Nagpur',
        minimumOrderQty: '5',
        unit: 'MT',
      },
    ],
  },
  {
    sku: 'TRY-ONI-001',
    name: 'Dehydrated White Onion Powder',
    slug: 'dehydrated-white-onion-powder',
    shortDescription: 'Air-dried white onion, milled to 100 mesh, low microbial load.',
    description:
      'Produced from Maharashtra white onion, hot-air dried and milled to 100 mesh. Free flowing, no anti-caking agent added. Suited to seasoning blends, soups and snack coatings.',
    categorySlug: 'dehydrated-onion',
    brand: 'Triyara',
    hsCode: '07122000',
    countryOfOrigin: 'IN',
    status: 'ACTIVE',
    specs: [
      { slug: 'moisture', value: '5' },
      { slug: 'purity', value: '99.5' },
      { slug: 'mesh', value: '100' },
      { slug: 'grade', value: 'A' },
      { slug: 'color', value: 'Creamy White' },
      { slug: 'shelf-life', value: '24' },
      { slug: 'packing', value: '20 kg carton with food-grade liner' },
      { slug: 'origin', value: 'Nashik, Maharashtra' },
      { slug: 'lead-time', value: '18' },
    ],
    tags: ['export-quality', 'best-seller'],
    images: [
      {
        url: 'https://cdn.triyaraexports.com/catalog/onion-powder/primary.jpg',
        altText: 'Creamy white dehydrated onion powder',
        type: 'PRIMARY',
        sortOrder: 0,
      },
    ],
    documents: [
      {
        documentType: 'COA',
        title: 'Certificate of Analysis - Onion Powder',
        fileUrl: 'https://cdn.triyaraexports.com/docs/onion-powder/coa.pdf',
        version: 'Rev-1',
        validUntil: new Date('2027-09-30T00:00:00.000Z'),
        isPublic: true,
      },
      {
        documentType: 'LAB_REPORT',
        title: 'Microbiological Lab Report',
        fileUrl: 'https://cdn.triyaraexports.com/docs/onion-powder/micro.pdf',
      },
    ],
    prices: [
      {
        currency: 'USD',
        price: '2450.0000',
        incoterm: 'FOB',
        port: 'Nhava Sheva',
        minimumOrderQty: '12',
        unit: 'MT',
      },
      {
        currency: 'USD',
        price: '2680.0000',
        incoterm: 'CIF',
        port: 'Dubai',
        minimumOrderQty: '12',
        unit: 'MT',
      },
    ],
  },
  {
    sku: 'TRY-GAR-001',
    name: 'Dehydrated Garlic Flakes',
    slug: 'dehydrated-garlic-flakes',
    shortDescription: 'Grade A dehydrated garlic flakes, sulphur free.',
    description:
      'Hot-air dried garlic flakes with a pungent aroma and uniform flake size. Sulphur free and suitable for organic-certified blends on request.',
    categorySlug: 'dehydrated-garlic',
    brand: 'Triyara',
    hsCode: '07129010',
    countryOfOrigin: 'IN',
    status: 'ACTIVE',
    specs: [
      { slug: 'moisture', value: '6' },
      { slug: 'purity', value: '99' },
      { slug: 'grade', value: 'A' },
      { slug: 'color', value: 'Off White' },
      { slug: 'shelf-life', value: '24' },
      { slug: 'packing', value: '10 kg carton' },
      { slug: 'origin', value: 'Gujarat' },
      { slug: 'lead-time', value: '20' },
    ],
    tags: ['organic', 'export-quality'],
    images: [
      {
        url: 'https://cdn.triyaraexports.com/catalog/garlic-flakes/primary.jpg',
        altText: 'Off-white dehydrated garlic flakes',
        type: 'PRIMARY',
        sortOrder: 0,
      },
    ],
    documents: [
      {
        documentType: 'ORGANIC_CERTIFICATE',
        title: 'Organic Certification',
        fileUrl: 'https://cdn.triyaraexports.com/docs/garlic-flakes/organic.pdf',
        validUntil: new Date('2027-12-31T00:00:00.000Z'),
        isPublic: true,
      },
    ],
    prices: [
      {
        currency: 'USD',
        price: '2980.0000',
        incoterm: 'FOB',
        port: 'Mundra',
        minimumOrderQty: '10',
        unit: 'MT',
      },
      {
        currency: 'EUR',
        price: '3320.0000',
        incoterm: 'CIF',
        port: 'Rotterdam',
        minimumOrderQty: '10',
        unit: 'MT',
      },
    ],
  },
  {
    sku: 'TRY-CUM-001',
    name: 'Cumin Seeds',
    slug: 'cumin-seeds',
    shortDescription: 'Machine-cleaned Unjha cumin, 99% purity.',
    description:
      'Sortex-cleaned cumin seed from the Unjha belt. Available at 99% and 99.5% purity, packed in 25 kg PP bags.',
    categorySlug: 'seed-spices',
    brand: 'Triyara',
    hsCode: '09093121',
    countryOfOrigin: 'IN',
    status: 'ACTIVE',
    specs: [
      { slug: 'purity', value: '99' },
      { slug: 'moisture', value: '9' },
      { slug: 'grade', value: 'A' },
      { slug: 'shelf-life', value: '18' },
      { slug: 'packing', value: '25 kg PP bag' },
      { slug: 'origin', value: 'Unjha, Gujarat' },
      { slug: 'container-capacity', value: '19 MT / 20ft FCL' },
      { slug: 'lead-time', value: '15' },
    ],
    tags: ['premium', 'export-quality'],
    images: [
      {
        url: 'https://cdn.triyaraexports.com/catalog/cumin-seeds/primary.jpg',
        altText: 'Cleaned cumin seeds',
        type: 'PRIMARY',
        sortOrder: 0,
      },
    ],
    documents: [
      {
        documentType: 'PHYTOSANITARY',
        title: 'Phytosanitary Certificate',
        fileUrl: 'https://cdn.triyaraexports.com/docs/cumin-seeds/phyto.pdf',
      },
    ],
    prices: [
      {
        currency: 'USD',
        price: '3150.0000',
        incoterm: 'FOB',
        port: 'Nhava Sheva',
        minimumOrderQty: '19',
        unit: 'MT',
      },
    ],
  },
  {
    sku: 'TRY-CHI-001',
    name: 'Red Chilli Powder',
    slug: 'red-chilli-powder',
    shortDescription: 'Guntur S4 chilli powder, 35,000 SHU.',
    description:
      'Ground Guntur S4 chilli with deep red colour and high pungency. Steam sterilised on request.',
    categorySlug: 'ground-spices',
    brand: 'Triyara',
    hsCode: '09042110',
    countryOfOrigin: 'IN',
    status: 'ACTIVE',
    specs: [
      { slug: 'moisture', value: '10' },
      { slug: 'mesh', value: '60' },
      { slug: 'grade', value: 'B' },
      { slug: 'color', value: 'Deep Red' },
      { slug: 'shelf-life', value: '18' },
      { slug: 'origin', value: 'Guntur, Andhra Pradesh' },
      { slug: 'lead-time', value: '21' },
    ],
    tags: ['best-seller'],
    images: [
      {
        url: 'https://cdn.triyaraexports.com/catalog/chilli-powder/primary.jpg',
        altText: 'Deep red chilli powder',
        type: 'PRIMARY',
        sortOrder: 0,
      },
    ],
    documents: [
      {
        documentType: 'COA',
        title: 'Certificate of Analysis - Chilli Powder',
        fileUrl: 'https://cdn.triyaraexports.com/docs/chilli-powder/coa.pdf',
        version: 'Rev-2',
        isPublic: true,
      },
    ],
    prices: [
      {
        currency: 'USD',
        price: '2240.0000',
        incoterm: 'FOB',
        port: 'Chennai',
        minimumOrderQty: '15',
        unit: 'MT',
      },
    ],
  },
  {
    sku: 'TRY-SES-001',
    name: 'Hulled Sesame Seeds',
    slug: 'hulled-sesame-seeds',
    shortDescription: '99.95% purity hulled sesame, machine sorted.',
    description:
      'Mechanically hulled natural white sesame seed, colour sorted to 99.95% purity. Draft listing pending final lab confirmation.',
    categorySlug: 'oil-seeds',
    brand: 'Triyara',
    hsCode: '12074090',
    countryOfOrigin: 'IN',
    status: 'DRAFT',
    specs: [
      { slug: 'purity', value: '99.95' },
      { slug: 'moisture', value: '5' },
      { slug: 'grade', value: 'A' },
      { slug: 'origin', value: 'Gujarat' },
      { slug: 'lead-time', value: '25' },
    ],
    tags: ['new-arrival'],
    images: [
      {
        url: 'https://cdn.triyaraexports.com/catalog/sesame-seeds/primary.jpg',
        altText: 'Hulled white sesame seeds',
        type: 'PRIMARY',
        sortOrder: 0,
      },
    ],
    documents: [],
    prices: [
      {
        currency: 'USD',
        price: '1780.0000',
        incoterm: 'FOB',
        port: 'Mundra',
        minimumOrderQty: '20',
        unit: 'MT',
      },
    ],
  },
]

/** Numeric/boolean/date projections mirror what the service layer writes. */
function projections(dataType: DataType, value: string) {
  if (dataType === 'NUMBER') {
    const n = Number(value)
    return { valueNumber: Number.isFinite(n) ? value : null, valueBoolean: null, valueDate: null }
  }
  if (dataType === 'BOOLEAN') {
    return { valueNumber: null, valueBoolean: value === 'true', valueDate: null }
  }
  if (dataType === 'DATE') {
    const d = new Date(value)
    return {
      valueNumber: null,
      valueBoolean: null,
      valueDate: Number.isNaN(d.getTime()) ? null : d,
    }
  }
  return { valueNumber: null, valueBoolean: null, valueDate: null }
}

export async function seedCatalog(prisma: PrismaClient, organizationId: string) {
  // --- Categories (parents first, so path/depth derive from the parent) ---
  const categoryIdBySlug = new Map<string, string>()
  const categoryPathBySlug = new Map<string, string>()

  for (const c of CATEGORIES) {
    const parentPath = c.parentSlug ? categoryPathBySlug.get(c.parentSlug) : undefined
    if (c.parentSlug && !parentPath) throw new Error(`Parent category not seeded: ${c.parentSlug}`)

    const path = `${parentPath ?? ''}/${c.slug}`
    const depth = path.split('/').filter(Boolean).length - 1

    const row = await prisma.category.upsert({
      where: { organizationId_slug: { organizationId, slug: c.slug } },
      update: { name: c.name, description: c.description, path, depth, sortOrder: c.sortOrder },
      create: {
        organizationId,
        slug: c.slug,
        name: c.name,
        description: c.description,
        parentId: c.parentSlug ? categoryIdBySlug.get(c.parentSlug) : null,
        path,
        depth,
        sortOrder: c.sortOrder,
      },
    })
    categoryIdBySlug.set(c.slug, row.id)
    categoryPathBySlug.set(c.slug, path)
  }

  // --- Specification definitions ---
  const specBySlug = new Map<string, { id: string; dataType: DataType }>()
  for (const s of SPEC_DEFINITIONS) {
    const row = await prisma.productSpecificationDefinition.upsert({
      where: { organizationId_slug: { organizationId, slug: s.slug } },
      update: {
        name: s.name,
        unit: s.unit,
        dataType: s.dataType,
        allowedValues: s.allowedValues ?? [],
        isFilterable: s.isFilterable ?? false,
        sortOrder: s.sortOrder,
      },
      create: {
        organizationId,
        slug: s.slug,
        name: s.name,
        unit: s.unit,
        dataType: s.dataType,
        allowedValues: s.allowedValues ?? [],
        isFilterable: s.isFilterable ?? false,
        sortOrder: s.sortOrder,
      },
    })
    specBySlug.set(s.slug, { id: row.id, dataType: row.dataType })
  }

  // --- Tags ---
  const tagIdBySlug = new Map<string, string>()
  for (const t of TAGS) {
    const row = await prisma.tag.upsert({
      where: { organizationId_slug: { organizationId, slug: t.slug } },
      update: { name: t.name, color: t.color, sortOrder: t.sortOrder },
      create: {
        organizationId,
        slug: t.slug,
        name: t.name,
        color: t.color,
        sortOrder: t.sortOrder,
      },
    })
    tagIdBySlug.set(t.slug, row.id)
  }

  // --- Products and their owned collections ---
  for (const p of PRODUCTS) {
    const categoryId = categoryIdBySlug.get(p.categorySlug)
    if (!categoryId) throw new Error(`Unknown category for ${p.sku}: ${p.categorySlug}`)

    const product = await prisma.product.upsert({
      where: { organizationId_sku: { organizationId, sku: p.sku } },
      update: {
        name: p.name,
        slug: p.slug,
        shortDescription: p.shortDescription,
        description: p.description,
        categoryId,
        brand: p.brand,
        hsCode: p.hsCode,
        countryOfOrigin: p.countryOfOrigin,
        status: p.status,
      },
      create: {
        organizationId,
        sku: p.sku,
        name: p.name,
        slug: p.slug,
        shortDescription: p.shortDescription,
        description: p.description,
        categoryId,
        brand: p.brand,
        hsCode: p.hsCode,
        countryOfOrigin: p.countryOfOrigin,
        status: p.status,
      },
    })

    // Owned collections are replaced wholesale, which keeps the seed idempotent
    // and cannot violate the one-PRIMARY-image or non-overlapping-price rules.
    await prisma.productSpecification.deleteMany({ where: { productId: product.id } })
    await prisma.productImage.deleteMany({ where: { productId: product.id } })
    await prisma.productDocument.deleteMany({ where: { productId: product.id } })
    await prisma.productPrice.deleteMany({ where: { productId: product.id } })
    await prisma.productTag.deleteMany({ where: { productId: product.id } })

    await prisma.productSpecification.createMany({
      data: p.specs.map((s, i) => {
        const def = specBySlug.get(s.slug)
        if (!def) throw new Error(`Unknown specification: ${s.slug}`)
        return {
          productId: product.id,
          definitionId: def.id,
          value: s.value,
          sortOrder: i * 10,
          ...projections(def.dataType, s.value),
        }
      }),
    })

    await prisma.productImage.createMany({
      data: p.images.map((img) => ({ productId: product.id, ...img })),
    })

    await prisma.productDocument.createMany({
      data: p.documents.map((d, i) => ({
        productId: product.id,
        documentType: d.documentType,
        title: d.title,
        fileUrl: d.fileUrl,
        version: d.version,
        validUntil: d.validUntil,
        isPublic: d.isPublic ?? false,
        mimeType: 'application/pdf',
        sortOrder: i * 10,
      })),
    })

    await prisma.productPrice.createMany({
      data: p.prices.map((pr) => ({
        productId: product.id,
        currency: pr.currency,
        price: pr.price,
        incoterm: pr.incoterm,
        port: pr.port,
        minimumOrderQty: pr.minimumOrderQty,
        unit: pr.unit,
        validFrom: PRICE_VALID_FROM,
      })),
    })

    await prisma.productTag.createMany({
      data: p.tags.map((slug) => {
        const tagId = tagIdBySlug.get(slug)
        if (!tagId) throw new Error(`Unknown tag: ${slug}`)
        return { productId: product.id, tagId }
      }),
    })
  }

  return {
    categories: CATEGORIES.length,
    specDefinitions: SPEC_DEFINITIONS.length,
    tags: TAGS.length,
    products: PRODUCTS.length,
  }
}
