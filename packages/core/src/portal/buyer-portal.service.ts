import type {
  BuyerQuotationItem,
  BuyerQuotationListResult,
  BuyerRfqDetail,
  BuyerRfqListItem,
  BuyerRfqListResult,
} from '@triyara/db'
import { ForbiddenError } from '@triyara/lib'

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

/**
 * One line of a requirement, as the buyer described it to us.
 *
 * `productName` collapses the two ways a line names its goods - a catalogue
 * product, or free text when there is no catalogue match - so the screen does
 * not have to know which. The line's own `id`, `version`, `remarks` and
 * `specifications` are absent, and so is every relation: `RFQItem` also joins to
 * supplier responses and quotation items, which are the other side of the
 * intermediary.
 */
export interface BuyerRequirementItemView {
  readonly lineNumber: number
  readonly productName: string | null
  readonly quantity: string
  readonly unit: string
  readonly requiredCertifications: string[]
  readonly packaging: string | null
}

/**
 * One requirement in full.
 *
 * The list's eleven fields plus the lines. No `description`: the domain records
 * no difference between what the buyer wrote and what an operator edited
 * afterwards, so it cannot be shown as theirs.
 */
export interface BuyerRequirementDetail extends BuyerRequirementView {
  readonly items: BuyerRequirementItemView[]
}

/**
 * One offer TRIYARA has sent this buyer.
 *
 * `grandTotal` is what we quoted them - our price to them, not anyone's cost to
 * us. The arithmetic behind it (subtotal, charges, discounts, tax, fx) stays
 * internal, and so does every relation: `items` leads to `sourceOptions`, which
 * holds supplier identity and landed cost.
 *
 * No quotation id. `quotationNumber` and `revisionNumber` together name the
 * offer in the language we already use with the buyer.
 */
export interface BuyerQuotationView {
  readonly quotationNumber: string
  readonly revisionNumber: number
  readonly status: string
  readonly currency: string
  /** Serialised from Decimal. Null until the totals have been computed. */
  readonly grandTotal: string | null
  readonly sentAt: Date | null
  readonly validUntil: Date | null
}

export interface BuyerQuotationList {
  readonly items: BuyerQuotationView[]
  /** True when the account has more offers than this page shows. No cursor. */
  readonly hasMore: boolean
}

/** The narrow slice of the quotation repository this needs. Nothing wider. */
export interface BuyerQuotationLookup {
  listQuotationsForBuyer(
    organizationId: string,
    buyerId: string,
    limit?: number,
  ): Promise<BuyerQuotationListResult>
}

/** The narrow slice of the RFQ repository this needs. Nothing wider. */
export interface BuyerRfqLookup {
  listForBuyer(organizationId: string, buyerId: string, limit?: number): Promise<BuyerRfqListResult>
  findForBuyer(
    organizationId: string,
    buyerId: string,
    rfqNumber: string,
  ): Promise<BuyerRfqDetail | null>
}

export interface BuyerPortalDeps {
  rfqs: BuyerRfqLookup
  quotations: BuyerQuotationLookup
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

/**
 * The one message every detail refusal uses.
 *
 * Identical whether the RFQ does not exist, belongs to another organization,
 * belongs to another buyer, is INTERNAL, or is deleted - because the difference
 * between those answers tells a caller whether somebody else's requirement
 * exists. The same reasoning, and the same wording, as the portal context.
 */
const REFUSED = 'This portal is not available for your account.'

/** Builds one offer, field by field. `Decimal` never leaves as an object. */
function toQuotation(row: BuyerQuotationItem): BuyerQuotationView {
  return {
    quotationNumber: row.quotationNumber,
    revisionNumber: row.revisionNumber,
    status: row.status,
    currency: row.currency,
    grandTotal: row.grandTotal?.toString() ?? null,
    sentAt: row.sentAt,
    validUntil: row.validUntil,
  }
}

/** Builds one line, field by field. `Decimal` is serialised rather than passed on. */
function toItem(row: BuyerRfqDetail['items'][number]): BuyerRequirementItemView {
  return {
    lineNumber: row.lineNumber,
    productName: row.product?.name ?? row.customProductName,
    quantity: row.quantity.toString(),
    unit: row.unit,
    requiredCertifications: row.requiredCertifications,
    packaging: row.packaging,
  }
}

export function createBuyerPortalService({ quotations, rfqs }: BuyerPortalDeps) {
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

    /**
     * One requirement the party owns, by the number they can see.
     *
     * Takes the resolved party and the identifier off the URL - and nothing
     * else. The identifier cannot widen anything: it is matched inside a query
     * already narrowed to this organization and this account, so the worst a
     * guessed number does is fail to match.
     *
     * A miss and a refusal are the same outcome here, deliberately. The
     * repository returns null for "no such number", "another buyer's", "another
     * tenant's", "internal" and "deleted" alike, and this turns all five into one
     * message rather than letting the difference disclose which it was.
     */
    async getRequirement(
      party: PortalPartyContext,
      rfqNumber: string,
    ): Promise<BuyerRequirementDetail> {
      const found = await rfqs.findForBuyer(party.organizationId, party.accountId, rfqNumber)
      if (!found) throw new ForbiddenError(REFUSED)

      return { ...toRequirement(found), items: found.items.map(toItem) }
    },

    /**
     * The offers we have sent this party.
     *
     * Takes the resolved party and nothing else - no account, no organization,
     * no status filter. Which quotations count as the buyer's to see is decided
     * in the repository query, not by a caller, so no argument here can widen
     * it to an internal draft.
     */
    async listQuotations(party: PortalPartyContext): Promise<BuyerQuotationList> {
      const { items, hasMore } = await quotations.listQuotationsForBuyer(
        party.organizationId,
        party.accountId,
      )

      return { items: items.map(toQuotation), hasMore }
    },
  }
}

export type BuyerPortalService = ReturnType<typeof createBuyerPortalService>
