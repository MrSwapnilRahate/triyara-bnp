import type { RoleName } from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

// Seeds one organization, the four roles, and an initial admin user.
// Run with: pnpm --filter @triyara/db db:seed  (requires DATABASE_URL)
const prisma = new PrismaClient()

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: 'triyara' },
    update: {},
    create: { name: 'Triyara Exports LLP', slug: 'triyara' },
  })

  const roleNames: RoleName[] = ['ADMIN', 'EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY']
  for (const name of roleNames) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } })
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } })
  const passwordHash = await bcrypt.hash('ChangeMe!123', 12)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@triyaraexports.com' },
    update: {},
    create: {
      organizationId: org.id,
      email: 'admin@triyaraexports.com',
      name: 'Triyara Admin',
      passwordHash,
      status: 'ACTIVE',
    },
  })

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  })

  // ---- Product Catalog reference data ----
  const orgId = org.id
  const units = [
    ['KG', 'Kilogram'],
    ['MT', 'Metric Tonne'],
    ['TON', 'Ton'],
    ['PIECE', 'Piece'],
    ['BAG', 'Bag'],
    ['LITER', 'Liter'],
    ['CONTAINER', 'Container'],
    ['BOX', 'Box'],
    ['CARTON', 'Carton'],
    ['DRUM', 'Drum'],
  ]
  for (const [code, name] of units) {
    await prisma.unitOfMeasure.upsert({
      where: { organizationId_code: { organizationId: orgId, code } },
      update: {},
      create: { organizationId: orgId, code, name },
    })
  }
  const packaging = [
    ['PP_BAG', 'PP Bag'],
    ['JUTE_BAG', 'Jute Bag'],
    ['CARTON', 'Carton'],
    ['PALLET', 'Pallet'],
    ['DRUM', 'Drum'],
    ['BULK', 'Bulk'],
    ['CONTAINER', 'Container'],
    ['CUSTOM', 'Custom'],
  ]
  for (const [code, name] of packaging) {
    await prisma.packagingType.upsert({
      where: { organizationId_code: { organizationId: orgId, code } },
      update: {},
      create: { organizationId: orgId, code, name },
    })
  }
  const origins = [
    ['IN', 'India'],
    ['AE', 'United Arab Emirates'],
    ['SA', 'Saudi Arabia'],
    ['US', 'United States'],
    ['GB', 'United Kingdom'],
    ['DE', 'Germany'],
    ['AU', 'Australia'],
  ]
  for (const [code, name] of origins) {
    await prisma.originCountry.upsert({
      where: { organizationId_code: { organizationId: orgId, code } },
      update: {},
      create: { organizationId: orgId, code, name },
    })
  }
  const hsCodes = [
    ['0712.20', 'Dried onions, whole/cut/sliced/broken/powder'],
    ['0712.90', 'Other dried vegetables (incl. garlic)'],
    ['0910.30', 'Turmeric (curcuma)'],
    ['1211.90', 'Plants/parts for perfumery/pharmacy (incl. moringa)'],
  ]
  for (const [code, description] of hsCodes) {
    const existing = await prisma.hSCode.findFirst({ where: { organizationId: orgId, code } })
    if (!existing)
      await prisma.hSCode.create({ data: { organizationId: orgId, code, description } })
  }
  const attributes: [string, string, 'STRING' | 'NUMBER' | 'BOOLEAN', string | null][] = [
    ['moisture', 'Moisture', 'NUMBER', '%'],
    ['purity', 'Purity', 'NUMBER', '%'],
    ['color', 'Color', 'STRING', null],
    ['protein', 'Protein', 'NUMBER', '%'],
    ['oil', 'Oil Content', 'NUMBER', '%'],
    ['mesh_size', 'Mesh Size', 'STRING', null],
    ['shelf_life', 'Shelf Life', 'NUMBER', 'months'],
    ['packaging_grade', 'Packaging Grade', 'STRING', null],
  ]
  for (const [key, label, dataType, unit] of attributes) {
    await prisma.productAttribute.upsert({
      where: { organizationId_key: { organizationId: orgId, key } },
      update: {},
      create: { organizationId: orgId, key, label, dataType, unit },
    })
  }

  // eslint-disable-next-line no-console
  console.log('Seeded org, roles, and admin (admin@triyaraexports.com / ChangeMe!123)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
