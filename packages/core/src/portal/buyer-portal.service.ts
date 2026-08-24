import type { BuyerRfqListItem, BuyerRfqListResult } from '@triyara/db'

import type { PortalPartyContext } from './portal-context.service'

/**
 * Buyer-facing reads (TRY-BNP-PORTAL-RFQ).
 *
 * Authorization here is ownership, not capability. EXTERNAL_PARTY holds no CASL
 * rule and gains none: the question this service asks is "does this record
 * belong to your account", which `assertAbility` cannot answer because it never
 * sees a record. So nothing in here calls it, and nothing needs to.
 *
 * That also rules out the existing internal services. `rfqService.list` opens
 * with `assertAbility(ctx, 'read', 'RFQ')` and would throw for every portal
 * user; the only ways to reuse it are to grant the role an ability - which would
 * hand one buyer every other buyer's RFQs, since CASL rules here carry no
 * conditions - or to remove the guard. Both are worse than a second read path.
 */

/**
 * One of the buyer's own RFQs, as they may see it.
 *
 * Every field is either something they told us or something we have told them.
 * Absent, deliberately: `awardedSupplierId` and the supplier list, which are the
 * other side of the intermediary; `awardedById` and the audit columns, which are
 * TRIYARA's staff; `organizationId` and `buyerId`, which are scope rather than
 * content; `id`, because nothing yet needs to address a single RFQ; and
 * `description` and `type`, which the design review left unresolved rather than
 * assumed safe.
 */
export interface BuyerRequirementView {
  readonly rfqNumber: string
  readonly title: string
  readonly status: string
  readonly priority: string
  readonly currency: string | null
  readonly incoterm: string | null
  readonly destinationCountry: string | null
  readonly destinationPort: string | null
  readonly expectedShipmentDate: Date | null
  readonly quotationDeadline: Date | null
  readonly createdAt: Date
}

export interface BuyerRequirementList {
  readonly items: BuyerRequirementView[]
  /** True when the account owns more than this page shows. Carries no cursor. */
  readonly hasMore: boolean
}

/** The narrow slice of the RFQ repository this needs. Nothing wider. */
export interface BuyerRfqLookup {
  listForBuyer(organizationId: string, buyerId: string, limit?: number): Promise<BuyerRfqListResult>
}

export interface BuyerPortalDeps {
  rfqs: BuyerRfqLookup
}

/**
 * Builds the view from a row, field by field.
 *
 * Not a spread. The row is already narrowed by `buyerListSelect`, so a spread
 * would be correct today and silently wrong the first time somebody adds a
 * column to that select for an unrelated reason.
 */
function toRequirement(row: BuyerRfqListItem): BuyerRequirementView {
  return {
    rfqNumber: row.rfqNumber,
    title: row.title,
    status: row.status,
    priority: row.priority,
    currency: row.currency,
    incoterm: row.incoterm,
    destinationCountry: row.destinationCountry,
    destinationPort: row.destinationPort,
    expectedShipmentDate: row.expectedShipmentDate,
    quotationDeadline: row.quotationDeadline,
    createdAt: row.createdAt,
  }
}

export function createBuyerPortalService({ rfqs }: BuyerPortalDeps) {
  return {
    /**
     * The requirements this party has raised with us.
     *
     * Takes the resolved party and nothing else. There is deliberately no
     * `accountId` or `organizationId` parameter: a parameter is something a
     * caller can pass, and a caller that can pass an account is one route
     * handler away from passing one that came off a URL. Both scopes are read
     * off the context that `portalContextService.resolve` already proved -
     * approved, in this organization, and a buyer.
     */
    async listRequirements(party: PortalPartyContext): Promise<BuyerRequirementList> {
      const { items, hasMore } = await rfqs.listForBuyer(party.organizationId, party.accountId)

      return { items: items.map(toRequirement), hasMore }
    },
  }
}

export type BuyerPortalService = ReturnType<typeof createBuyerPortalService>
