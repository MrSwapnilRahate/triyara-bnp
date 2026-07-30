import type { RoleName } from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

import { seedCatalog } from './seed-catalog'
import { seedQuotations } from './seed-quotation'
import { seedRfqs } from './seed-rfq'
import { seedSuppliers } from './seed-supplier'

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

  const catalog = await seedCatalog(prisma, org.id)
  const suppliers = await seedSuppliers(prisma, org.id)
  const rfqs = await seedRfqs(prisma, org.id)
  const quotations = await seedQuotations(prisma, org.id)

  /* eslint-disable no-console */
  console.log('Seeded org, roles, and admin (admin@triyaraexports.com / ChangeMe!123)')
  console.log(
    `Seeded catalog: ${catalog.categories} categories, ${catalog.specDefinitions} spec definitions, ` +
      `${catalog.tags} tags, ${catalog.products} products`,
  )
  console.log(`Seeded suppliers: ${suppliers.suppliers}`)
  console.log(`Seeded RFQs: ${rfqs.rfqs}`)
  console.log(
    `Seeded quotations: ${quotations.quotations} quotations, ${quotations.options} sourcing options, ` +
      `${quotations.paymentTerms} payment terms, ${quotations.exchangeRates} exchange rates`,
  )
  /* eslint-enable no-console */
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
