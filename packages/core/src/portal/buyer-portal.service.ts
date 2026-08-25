import type {
  BuyerDocumentItem,
  BuyerDocumentListResult,
  BuyerPendingListResult,
  BuyerPendingRequirement,
  BuyerQuotationDetail,
  BuyerQuotationItem,
  BuyerQuotationListResult,
  BuyerRfqDetail,
  BuyerRfqListItem,
  BuyerRfqListResult,
} from '@triyara/db'
import { ForbiddenError } from '@triyara/lib'
import type { PortalRequirementDto } from '@triyara/validation'

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

/**
 * One line of an offer, as the buyer may read it.
 *
 * `unitPrice` and `lineSubtotal` are what we quoted. The line's `unitCost` and
 * `marginPercent` are what it cost us, the schema marks both INTERNAL, and
 * neither is fetched. `lineTotal` is absent for a different reason: it folds in
 * line-scoped charges and taxes that the header totals already carry, so
 * showing it beside them would count the same money twice.
 */
export interface BuyerQuotationLineView {
  readonly lineNumber: number
  /** Catalogue name when the line names a product, the free-text name otherwise. */
  readonly productName: string | null
  readonly quantity: string
  readonly unit: string
  readonly unitPrice: string
  readonly lineSubtotal: string
  readonly packaging: string | null
  readonly hsCode: string | null
  readonly countryOfOrigin: string | null
  readonly requiredCertifications: readonly string[]
  readonly leadTimeDays: number | null
}

/**
 * A charge we told the buyer about.
 *
 * Only charges we marked `isVisibleToCustomer` reach here. The flag is the
 * schema's own record of what a customer sees broken out rather than absorbed
 * into a unit price, so it is the decision, not a heuristic.
 */
export interface BuyerQuotationChargeView {
  readonly type: string
  readonly label: string | null
  readonly amount: string
  readonly currency: string
  /** True for a discount or other deduction: the amount is subtracted. */
  readonly isDeduction: boolean
}

/**
 * One offer in full, as the buyer we made it to may read it.
 *
 * The money reconciles in the open:
 *
 *   subtotal + chargesTotal - discountTotal + taxTotal = grandTotal
 *
 * and every one of those is a component of our price to them. What we paid to
 * source it - `costTotal`, `marginPercent`, and per line `unitCost` - is not
 * here, is not fetched, and is what separates a quotation a buyer may read from
 * the internal record of the same offer.
 */
export interface BuyerQuotationDetailView {
  readonly quotationNumber: string
  readonly revisionNumber: number
  readonly type: string
  readonly status: string
  readonly title: string | null
  readonly currency: string
  readonly subtotal: string | null
  readonly chargesTotal: string | null
  readonly discountTotal: string | null
  readonly taxTotal: string | null
  readonly grandTotal: string | null
  readonly incoterm: string | null
  readonly namedPlace: string | null
  readonly destinationCountry: string | null
  readonly destinationPort: string | null
  readonly paymentTermsText: string | null
  readonly leadTimeDays: number | null
  readonly packingSummary: string | null
  readonly samplingTerms: string | null
  readonly sentAt: Date | null
  readonly validFrom: Date | null
  readonly validUntil: Date | null
  readonly acceptedAt: Date | null
  readonly rejectedAt: Date | null
  readonly lines: readonly BuyerQuotationLineView[]
  readonly charges: readonly BuyerQuotationChargeView[]
}

/**
 * One document on the buyer's own account, as they may read it.
 *
 * What they gave us at onboarding, and where it got to. The file is described
 * but not reachable: `currentStorageKey` and `currentChecksum` are not fetched,
 * and this batch adds no download - a storage key in a payload is a storage key
 * in the DOM, whether or not anything renders it.
 *
 * No `id`. Nothing yet addresses a single document, and every buyer-facing
 * projection in this portal has kept row ids out on purpose. Unlike an RFQ or a
 * quotation a document carries no business identifier at all, so there is not
 * even a safe alternative to link by - which is why this batch is a list.
 *
 * Absent for the same reason as everywhere else: `accountId` and
 * `organizationId` are scope rather than content, `supplierProfileId` belongs to
 * the other side of the intermediary, and `createdById`/`updatedById` name the
 * TRIYARA staff who handled the file.
 */
export interface BuyerDocumentView {
  readonly title: string
  readonly type: string
  readonly status: string
  /** Serialised dates. Null when we were never told. */
  readonly issuedDate: Date | null
  readonly expiryDate: Date | null
  readonly fileName: string
  readonly fileSize: number
  readonly mimeType: string
  readonly uploadedAt: Date
}

export interface BuyerDocumentList {
  readonly items: BuyerDocumentView[]
  /** True when the account holds more documents than this page shows. No cursor. */
  readonly hasMore: boolean
}

/** The narrow slice of the document repository this needs. Nothing wider. */
export interface BuyerDocumentLookup {
  countDocumentsForBuyer(organizationId: string, accountId: string): Promise<number>
  listDocumentsForBuyer(
    organizationId: string,
    accountId: string,
    limit?: number,
  ): Promise<BuyerDocumentListResult>
}

/** The narrow slice of the quotation repository this needs. Nothing wider. */
export interface BuyerQuotationLookup {
  countForBuyer(organizationId: string, buyerId: string): Promise<number>
  listQuotationsForBuyer(
    organizationId: string,
    buyerId: string,
    limit?: number,
  ): Promise<BuyerQuotationListResult>
  findQuotationForBuyer(
    organizationId: string,
    buyerId: string,
    quotationNumber: string,
  ): Promise<BuyerQuotationDetail | null>
}

/** The narrow slice of the RFQ repository this needs. Nothing wider. */
export interface BuyerRfqLookup {
  countForBuyer(organizationId: string, buyerId: string): Promise<number>
  listForBuyer(organizationId: string, buyerId: string, limit?: number): Promise<BuyerRfqListResult>
  findForBuyer(
    organizationId: string,
    buyerId: string,
    rfqNumber: string,
  ): Promise<BuyerRfqDetail | null>
}

/**
 * A requirement the buyer has sent us that is still in triage.
 *
 * Four fields, matching the projection exactly. It is deliberately NOT the same
 * shape as `BuyerRequirementView`: an enquiry under review is not an RFQ, has no
 * RFQ number, no priority, no incoterm and no deadline, and dressing it up as
 * one would tell the buyer we have started sourcing when nobody has looked at it
 * yet.
 */
export interface BuyerPendingRequirementView {
  readonly reference: string
  readonly product: string
  readonly quantity: string
  readonly submittedAt: Date
}

export interface BuyerPendingRequirementList {
  readonly items: BuyerPendingRequirementView[]
  readonly hasMore: boolean
}

/**
 * How much of each thing this buyer has with us.
 *
 * Four numbers and nothing else. No money, no status breakdown, no supplier
 * count - a summary is a way into the pages that hold the detail, not a second
 * place for the detail to live, and every figure it carries is one more thing
 * that can disagree with the page it links to.
 */
export interface BuyerPortalSummary {
  /** RFQs we are sourcing against. */
  readonly requirements: number
  /** Enquiries sent but not yet triaged. */
  readonly pendingRequirements: number
  readonly quotations: number
  readonly documents: number
}

/** What a buyer is told after their requirement lands. */
export interface BuyerRequirementReceipt {
  readonly reference: string
  /** True when this matched a submission they had just made. */
  readonly alreadySubmitted: boolean
}

/** The narrow slice of the intake repository this needs. Nothing wider. */
export interface BuyerIntakeLookup {
  create(
    ctx: { actorId: string; organizationId: string; requestId?: string | undefined },
    data: {
      product: string
      quantity: string
      contactName: string
      contactEmail: string
      buyerAccountId?: string | undefined
      source?: string | undefined
      companyName?: string | undefined
      country?: string | undefined
      monthlyVolume?: string | undefined
      packaging?: string | undefined
      targetPrice?: string | undefined
      destinationPort?: string | undefined
      timeline?: string | undefined
      requirements?: string | undefined
    },
  ): Promise<{ reference: string }>
  countPendingForBuyer(organizationId: string, buyerAccountId: string): Promise<number>
  listPendingForBuyer(
    organizationId: string,
    buyerAccountId: string,
    limit?: number,
  ): Promise<BuyerPendingListResult>
  findRecentDuplicateForBuyer(
    organizationId: string,
    buyerAccountId: string,
    product: string,
    since: Date,
  ): Promise<{ reference: string } | null>
}

/**
 * Who the signed-in person is, read from the database rather than the token.
 *
 * `contactName` and `contactEmail` are NOT NULL on the row, and the session is
 * the wrong source for them: `loadContext` maps a missing claim to `''`, so
 * trusting it would write an empty string into a column whose whole purpose is
 * to be a route back to the buyer. The `User` row has both as required columns.
 */
export interface PortalContactLookup {
  findPortalContact(
    organizationId: string,
    userId: string,
  ): Promise<{ name: string; email: string } | null>
}

export interface BuyerPortalDeps {
  rfqs: BuyerRfqLookup
  quotations: BuyerQuotationLookup
  documents: BuyerDocumentLookup
  intake: BuyerIntakeLookup
  contacts: PortalContactLookup
}

/**
 * How long a repeat of the same product counts as the same submission.
 *
 * Long enough to absorb a double-click or an impatient reload, short enough that
 * a buyer who genuinely needs the same goods again an hour later is not told
 * they already asked.
 */
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000

/** The channel this enquiry arrived through. Never taken from the caller. */
const PORTAL_SOURCE = 'BUYER_PORTAL'

function toPendingRequirement(row: BuyerPendingRequirement): BuyerPendingRequirementView {
  return {
    reference: row.reference,
    product: row.product,
    quantity: row.quantity,
    submittedAt: row.createdAt,
  }
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

/** Builds one quoted line, field by field. `Decimal` never leaves as an object. */
function toQuotationLine(row: BuyerQuotationDetail['items'][number]): BuyerQuotationLineView {
  return {
    lineNumber: row.lineNumber,
    productName: row.product?.name ?? row.customProductName,
    quantity: row.quantity.toString(),
    unit: row.unit,
    unitPrice: row.unitPrice.toString(),
    lineSubtotal: row.lineSubtotal.toString(),
    packaging: row.packaging,
    hsCode: row.hsCode,
    countryOfOrigin: row.countryOfOrigin,
    requiredCertifications: row.requiredCertifications,
    leadTimeDays: row.leadTimeDays,
  }
}

/**
 * Builds one document, field by field.
 *
 * The three `current*` columns are renamed on the way out. Inside the Document
 * module the prefix distinguishes the live version from the rows in
 * `DocumentVersion`; a buyer seeing one file has no such distinction to make,
 * and `currentOriginalFilename` reads like an implementation detail because it
 * is one.
 */
function toDocument(row: BuyerDocumentItem): BuyerDocumentView {
  return {
    title: row.title,
    type: row.type,
    status: row.status,
    issuedDate: row.issuedDate,
    expiryDate: row.expiryDate,
    fileName: row.currentOriginalFilename,
    fileSize: row.currentFileSize,
    mimeType: row.currentMimeType,
    uploadedAt: row.createdAt,
  }
}

/** Builds one visible charge, field by field. */
function toQuotationCharge(row: BuyerQuotationDetail['charges'][number]): BuyerQuotationChargeView {
  return {
    type: row.type,
    label: row.label,
    amount: row.amount.toString(),
    currency: row.currency,
    isDeduction: row.isDeduction,
  }
}

/**
 * Builds the offer, field by field, relations included.
 *
 * Not a spread of the row and not a spread of `toQuotation(row)` either. The
 * list view and the detail view answer different questions and only happen to
 * overlap on seven fields; chaining them would make the detail inherit whatever
 * the list is changed to carry next.
 */
function toQuotationDetail(row: BuyerQuotationDetail): BuyerQuotationDetailView {
  return {
    quotationNumber: row.quotationNumber,
    revisionNumber: row.revisionNumber,
    type: row.type,
    status: row.status,
    title: row.title,
    currency: row.currency,
    subtotal: row.subtotal?.toString() ?? null,
    chargesTotal: row.chargesTotal?.toString() ?? null,
    discountTotal: row.discountTotal?.toString() ?? null,
    taxTotal: row.taxTotal?.toString() ?? null,
    grandTotal: row.grandTotal?.toString() ?? null,
    incoterm: row.incoterm,
    namedPlace: row.namedPlace,
    destinationCountry: row.destinationCountry,
    destinationPort: row.destinationPort,
    paymentTermsText: row.paymentTermsText,
    leadTimeDays: row.leadTimeDays,
    packingSummary: row.packingSummary,
    samplingTerms: row.samplingTerms,
    sentAt: row.sentAt,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    acceptedAt: row.acceptedAt,
    rejectedAt: row.rejectedAt,
    lines: row.items.map(toQuotationLine),
    charges: row.charges.map(toQuotationCharge),
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

export function createBuyerPortalService({
  contacts,
  documents,
  intake,
  quotations,
  rfqs,
}: BuyerPortalDeps) {
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
    /**
     * How much of each thing this party has with us.
     *
     * Four counts, each run with the same scope object its list uses, so the
     * overview can never claim a number the page it links to does not show.
     * Counted in the database rather than by measuring a list: every one of
     * those is capped at fifty, and a buyer with more would be told they had
     * fewer.
     *
     * Issued together. They are independent reads of one party's own records and
     * nothing here needs them consistent with each other to a transaction - a
     * requirement promoted between two of these counts is a page refresh away
     * from looking right, and paying for a transaction to avoid that would be
     * paying for the wrong thing.
     */
    async getSummary(party: PortalPartyContext): Promise<BuyerPortalSummary> {
      const [requirements, pendingRequirements, quotationCount, documentCount] = await Promise.all([
        rfqs.countForBuyer(party.organizationId, party.accountId),
        intake.countPendingForBuyer(party.organizationId, party.accountId),
        quotations.countForBuyer(party.organizationId, party.accountId),
        documents.countDocumentsForBuyer(party.organizationId, party.accountId),
      ])

      return {
        requirements,
        pendingRequirements,
        quotations: quotationCount,
        documents: documentCount,
      }
    },

    async listRequirements(party: PortalPartyContext): Promise<BuyerRequirementList> {
      const { items, hasMore } = await rfqs.listForBuyer(party.organizationId, party.accountId)

      return { items: items.map(toRequirement), hasMore }
    },

    /**
     * The requirements this party has sent us that nobody has triaged yet.
     *
     * Shown beside the RFQs rather than instead of them, so a buyer who submits
     * something can see that it arrived. The two lists never overlap: an enquiry
     * leaves this one at the moment it is promoted, which is the same moment the
     * RFQ it became appears in the other.
     *
     * Same shape of guarantee as every other read here - both scopes off the
     * resolved party, neither reachable by a caller.
     */
    async listPendingRequirements(party: PortalPartyContext): Promise<BuyerPendingRequirementList> {
      const { items, hasMore } = await intake.listPendingForBuyer(
        party.organizationId,
        party.accountId,
      )

      return { items: items.map(toPendingRequirement), hasMore }
    },

    /**
     * Records a requirement the buyer typed in the portal.
     *
     * The first write this portal has ever done, and the rules it follows are
     * the ones the reads established. Two arguments: the resolved party, and
     * what they asked for. Organization, account, contact name, contact email,
     * company, country and source are all derived here from the party - none of
     * them is a key on the input type, so there is no payload that can set one
     * and no branch that reads one if it tries.
     *
     * It creates an INTAKE record and stops. No RFQ, at all, ever: raising one
     * is a decision the trade desk makes about whether this is worth sourcing,
     * and a buyer who could raise their own would be inside the commercial
     * pipeline without anyone having agreed to put them there. That boundary is
     * what keeps TRIYARA between the buyer and the supplier network, and it is
     * why this calls the intake repository rather than the RFQ service.
     *
     * Nothing here asserts an ability. EXTERNAL_PARTY holds none and gains none:
     * `create QuoteRequest` is absent from every role by design, because the
     * only thing that has ever created an intake record is somebody submitting
     * one about themselves.
     */
    async submitRequirement(
      party: PortalPartyContext,
      input: PortalRequirementDto,
    ): Promise<BuyerRequirementReceipt> {
      // Read before written, and read from the database. The row needs a name
      // and an address that reach a real person; the session carries claims that
      // may be stale and that `loadContext` will happily hand over as `''`.
      const contact = await contacts.findPortalContact(party.organizationId, party.userId)
      // No fallback. A submission we could not attribute to a person is an
      // enquiry nobody can answer, and inventing a placeholder would put an
      // unreachable record in the trade desk's queue looking exactly like a
      // reachable one.
      if (!contact) throw new ForbiddenError(REFUSED)

      // Scoped to this account, so one buyer's repeat cannot suppress another's.
      const duplicate = await intake.findRecentDuplicateForBuyer(
        party.organizationId,
        party.accountId,
        input.product,
        new Date(Date.now() - DUPLICATE_WINDOW_MS),
      )
      // Answered with the reference they already have rather than an error. The
      // buyer did nothing wrong by clicking twice, and telling them it failed
      // would invite a third attempt.
      if (duplicate) return { reference: duplicate.reference, alreadySubmitted: true }

      const created = await intake.create(
        {
          actorId: party.userId,
          organizationId: party.organizationId,
        },
        {
          // What they asked for.
          product: input.product,
          quantity: input.quantity,
          monthlyVolume: input.monthlyVolume,
          packaging: input.packaging,
          targetPrice: input.targetPrice,
          destinationPort: input.destinationPort,
          timeline: input.timeline,
          requirements: input.requirements,
          // Who they are. Every one of these is server-derived.
          contactName: contact.name,
          contactEmail: contact.email,
          companyName: party.companyName,
          country: party.country ?? undefined,
          buyerAccountId: party.accountId,
          source: PORTAL_SOURCE,
        },
      )

      return { reference: created.reference, alreadySubmitted: false }
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
    /**
     * The documents on the buyer's own account.
     *
     * One argument, and it is the resolved party. There is no second parameter
     * through which a caller could name an account, which is the point: the
     * scope is not validated from input, it is taken from what `resolve` already
     * proved about this session.
     *
     * No refusal path of its own. An account with no documents has an empty
     * list, which is a true answer; the refusals that matter happened earlier,
     * in `resolve`, before this was reached.
     */
    async listDocuments(party: PortalPartyContext): Promise<BuyerDocumentList> {
      const { items, hasMore } = await documents.listDocumentsForBuyer(
        party.organizationId,
        party.accountId,
      )

      return { items: items.map(toDocument), hasMore }
    },

    async listQuotations(party: PortalPartyContext): Promise<BuyerQuotationList> {
      const { items, hasMore } = await quotations.listQuotationsForBuyer(
        party.organizationId,
        party.accountId,
      )

      return { items: items.map(toQuotation), hasMore }
    },

    /**
     * One of the buyer's own offers, by the number they can already see.
     *
     * Two arguments, and neither of them widens anything. `quotationNumber` is
     * matched inside a query already narrowed to this organization, this
     * account, the buyer-visible statuses and the undeleted rows, so a guessed
     * or edited number can only fail to match. Organization and account come
     * from the resolved party, never from the caller.
     *
     * A miss is the same `ForbiddenError` as every other portal refusal, because
     * the repository returns one `null` for five different reasons and the
     * difference between them - does this number exist, is it somebody else's,
     * did we withdraw it - is itself information about a buyer who is not this
     * one.
     */
    async getQuotation(
      party: PortalPartyContext,
      quotationNumber: string,
    ): Promise<BuyerQuotationDetailView> {
      const found = await quotations.findQuotationForBuyer(
        party.organizationId,
        party.accountId,
        quotationNumber,
      )
      if (!found) throw new ForbiddenError(REFUSED)

      return toQuotationDetail(found)
    },
  }
}

export type BuyerPortalService = ReturnType<typeof createBuyerPortalService>
