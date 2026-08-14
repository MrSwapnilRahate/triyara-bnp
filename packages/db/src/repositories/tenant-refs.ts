import type { Prisma } from '@prisma/client'
import { NotFoundError } from '@triyara/lib'

/**
 * Tenant checks for foreign keys the client chose.
 *
 * A request supplies productId and buyerId directly, and the row they land on
 * is written with the caller's own organizationId - so the record is filed
 * correctly while the reference inside it can point anywhere. The read path
 * then joins `product`, which is how another tenant's SKU and name come back
 * through an RFQ the caller is perfectly entitled to see.
 *
 * The shape here is the one `rfq-supplier.repository` and
 * `quotation-sourcing.repository` already use for supplierId: select the ids
 * that exist inside this organization, and refuse the whole write if any
 * requested id is not among them. Run inside the caller's transaction, so the
 * check and the write cannot drift apart.
 *
 * `NotFoundError` deliberately, not a forbidden: a record in another tenant is
 * one that does not exist as far as this caller is concerned, and saying
 * anything else would confirm it is real.
 */

/** Ids that are absent from this organization, in the order given. */
async function missingIds(
  found: ReadonlyArray<{ id: string }>,
  requested: readonly string[],
): Promise<string[]> {
  const present = new Set(found.map((r) => r.id))
  return requested.filter((id) => !present.has(id))
}

/** Refuses unless every product belongs to this organization. */
export async function assertProductsInOrg(
  tx: Prisma.TransactionClient,
  organizationId: string,
  productIds: readonly (string | null | undefined)[],
): Promise<void> {
  const ids = [...new Set(productIds.filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return

  const found = await tx.product.findMany({
    where: { id: { in: ids }, organizationId, deletedAt: null },
    select: { id: true },
  })
  const missing = await missingIds(found, ids)
  if (missing.length > 0) throw new NotFoundError(`Product not found: ${missing.join(', ')}`)
}

/** Refuses unless the buyer account belongs to this organization. */
export async function assertBuyerInOrg(
  tx: Prisma.TransactionClient,
  organizationId: string,
  buyerId: string | null | undefined,
): Promise<void> {
  if (!buyerId) return

  const found = await tx.account.findFirst({
    where: { id: buyerId, organizationId, deletedAt: null },
    select: { id: true },
  })
  if (!found) throw new NotFoundError(`Buyer not found: ${buyerId}`)
}
