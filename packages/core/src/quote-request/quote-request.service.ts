import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  MutationCtx,
  QuoteRequestListResult,
  QuoteRequestRecord,
  QuoteRequestRepository,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { ConflictError, NotFoundError, ValidationError } from '@triyara/lib'
import type {
  CreateRfqDto,
  ListQuoteRequestsQuery,
  PromoteQuoteRequestDto,
  PublicQuoteRequestDto,
  ReplaceRfqItemsDto,
  ReviewQuoteRequestDto,
} from '@triyara/validation'

// Public quote request intake (TRY-BNP-QR-01).
//
// Two surfaces with deliberately different trust models, mirroring the buyer and
// supplier registration services:
//
//   - `submit` is PUBLIC. No AuthContext, because the caller has no account.
//     The tenant comes from configuration, never from the request; the audit
//     actor is the reserved system identity; abuse is held off at the route by
//     IP rate limiting.
//   - everything else is INTERNAL and takes an AuthContext.
//
// The boundary this service exists to hold: a public submission produces an
// INTAKE record and nothing else. It never creates an RFQ, never creates an
// Account, and never touches the sourcing workflow. Promotion is a separate,
// explicit act by a signed-in operator - which is what keeps unqualified
// traffic out of the commercial pipeline and keeps TRIYARA the intermediary.

/** Reserved audit identity for work nobody signed in to do. Matches the registration services. */
export const QUOTE_REQUEST_SYSTEM_ACTOR_ID = 'system:public-quote-request'

export interface PublicQuoteRequestCtx {
  requestId?: string
}

export type QuoteRequestCtx = AuthContext & { requestId?: string }

export interface OrganizationLookup {
  findBySlug(slug: string): Promise<{ id: string } | null>
}

/**
 * The subset of the RFQ service promotion needs.
 *
 * Structural, not the concrete service: promotion depends on "something that can
 * raise an RFQ", and stating that as a shape keeps the RFQ module free to change
 * around it - and keeps this service testable without standing one up.
 */
export interface RfqCreator {
  create(
    ctx: QuoteRequestCtx,
    dto: CreateRfqDto,
    items: ReplaceRfqItemsDto['items'],
  ): Promise<{ id: string; rfqNumber: string }>
}

export interface QuoteRequestDeps {
  repo: QuoteRequestRepository
  events: EventBus
  organizations: OrganizationLookup
  intakeOrganizationSlug: string
  /** Optional so existing constructions keep working; promotion needs it. */
  rfqs?: RfqCreator
}

export function createQuoteRequestService({
  repo,
  events,
  organizations,
  intakeOrganizationSlug,
  rfqs,
}: QuoteRequestDeps) {
  /**
   * The tenant public submissions belong to.
   *
   * Resolved per call rather than cached at construction: the service is built
   * at module load, when the database may not be reachable, and a misconfigured
   * slug should surface as a clear message on the first enquiry rather than
   * crash the app's boot. Same reasoning as the registration services.
   */
  async function intakeOrganizationId(): Promise<string> {
    const org = await organizations.findBySlug(intakeOrganizationSlug)
    if (!org) {
      throw new NotFoundError(
        'We cannot take enquiries through the website at the moment. Please contact us directly.',
      )
    }
    return org.id
  }

  function mutationCtx(ctx: QuoteRequestCtx): MutationCtx {
    return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
  }

  return {
    /**
     * Records an enquiry from the public website.
     *
     * PUBLIC - there is no AuthContext and therefore no assertAbility call. That
     * is not an omission: the caller is an anonymous visitor, authorization has
     * nothing to decide, and the controls that matter here are the route's rate
     * limit, the bounded schema, and the fact that this writes exactly one row
     * in one tenant with no side effects on the commercial workflow.
     */
    async submit(
      ctx: PublicQuoteRequestCtx,
      dto: PublicQuoteRequestDto,
    ): Promise<QuoteRequestRecord> {
      const organizationId = await intakeOrganizationId()

      const created = await repo.create(
        {
          actorId: QUOTE_REQUEST_SYSTEM_ACTOR_ID,
          organizationId,
          requestId: ctx.requestId,
        },
        { ...dto, source: 'PUBLIC_WEBSITE' },
      )

      // Notification only. The row above is the system of record; if this throws
      // the enquiry is still captured, which is the entire point of the change.
      await events.emit(
        makeEvent({
          type: 'quote_request.submitted',
          organizationId,
          actorId: QUOTE_REQUEST_SYSTEM_ACTOR_ID,
          data: {
            quoteRequestId: created.id,
            reference: created.reference,
            product: created.product,
            companyName: created.companyName,
            country: created.country,
            leadScore: created.leadScore,
          },
        }),
      )

      return created
    },

    async list(
      ctx: QuoteRequestCtx,
      query: ListQuoteRequestsQuery,
    ): Promise<QuoteRequestListResult> {
      assertAbility(ctx, 'read', 'QuoteRequest')
      return repo.list({
        organizationId: ctx.organizationId,
        q: query.q,
        status: query.status,
        buyerAccountId: query.buyerAccountId,
        sort: query.sort,
        limit: query.limit,
        cursor: query.cursor,
      })
    },

    async get(ctx: QuoteRequestCtx, id: string): Promise<QuoteRequestRecord> {
      assertAbility(ctx, 'read', 'QuoteRequest')
      const found = await repo.findById(ctx.organizationId, id)
      if (!found) throw new NotFoundError('Quote request not found.')
      return found
    },

    /**
     * Triage: move the enquiry through its lifecycle and optionally attach it to
     * a buyer Account.
     *
     * PROMOTED is unreachable from here - the schema excludes it - because that
     * status asserts an RFQ exists, and only `promote` can make that true.
     */
    async review(
      ctx: QuoteRequestCtx,
      id: string,
      expectedVersion: number,
      dto: ReviewQuoteRequestDto,
    ): Promise<QuoteRequestRecord> {
      assertAbility(ctx, 'update', 'QuoteRequest')

      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('Quote request not found.')
      if (current.status === 'PROMOTED') {
        throw new ConflictError('This enquiry has already become an RFQ. Work on the RFQ instead.')
      }

      const updated = await repo.review(mutationCtx(ctx), id, expectedVersion, dto)
      if (!updated) {
        throw new ConflictError(
          'This enquiry changed while you were reviewing it. Reload and try again.',
        )
      }

      await events.emit(
        makeEvent({
          type: 'quote_request.reviewed',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: { quoteRequestId: id, status: updated.status },
        }),
      )
      return updated
    },

    /**
     * Turns a qualified enquiry into a real RFQ.
     *
     * Authorized on BOTH `update QuoteRequest` and `create RFQ`. No new authority
     * is invented: promoting is triaging a lead and raising an RFQ, and whoever
     * does it must already be allowed to do each. That also means the RFQ side
     * keeps its existing role matrix exactly.
     *
     * The RFQ is created through the RFQ service, never written directly, so it
     * gets the same validation, the same tenant checks, the same audit trail and
     * the same `RFQ_buyer_matches_type` constraint every other RFQ gets.
     */
    async promote(
      ctx: QuoteRequestCtx,
      id: string,
      expectedVersion: number,
      dto: PromoteQuoteRequestDto,
    ): Promise<{ quoteRequest: QuoteRequestRecord; rfqId: string; rfqNumber: string }> {
      assertAbility(ctx, 'update', 'QuoteRequest')
      assertAbility(ctx, 'create', 'RFQ')

      if (!rfqs) {
        throw new ValidationError('Promotion is not available in this configuration.')
      }

      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('Quote request not found.')
      if (current.status === 'PROMOTED') {
        throw new ConflictError('This enquiry has already become an RFQ.')
      }
      if (current.status === 'REJECTED') {
        throw new ConflictError('A rejected enquiry cannot be promoted. Reopen it first.')
      }

      const rfq = await rfqs.create(
        ctx,
        {
          rfqNumber: dto.rfqNumber,
          type: 'BUYER',
          // Non-null by contract, which is what satisfies the RFQ table's own
          // CHECK constraint. An anonymous enquiry acquires a buyer here or not
          // at all.
          buyerId: dto.buyerId,
          title: dto.title ?? `${current.product} - ${current.companyName ?? current.contactName}`,
          ...(dto.currency ? { currency: dto.currency } : {}),
          ...(current.destinationPort ? { destinationPort: current.destinationPort } : {}),
          priority: 'NORMAL',
        },
        [
          {
            // Free text, so it becomes a custom line rather than a catalog
            // reference. Matching it to a Product is a judgement call the
            // operator makes afterwards in the RFQ items editor.
            customProductName: current.product,
            quantity: dto.quantity,
            unit: dto.unit,
            // The buyer's own words, preserved verbatim. The structured quantity
            // above is the operator's reading of them; keeping the original
            // means that reading can be checked.
            remarks: [
              `From quote request ${current.reference}.`,
              `Buyer stated quantity: ${current.quantity}.`,
              current.monthlyVolume ? `Monthly volume: ${current.monthlyVolume}.` : null,
              current.packaging ? `Packaging: ${current.packaging}.` : null,
              current.targetPrice ? `Target price: ${current.targetPrice}.` : null,
              current.requirements ? `Additional requirements: ${current.requirements}` : null,
            ]
              .filter(Boolean)
              .join('\n')
              .slice(0, 2000),
            requiredCertifications: [],
          },
        ],
      )

      const updated = await repo.markPromoted(
        mutationCtx(ctx),
        id,
        expectedVersion,
        rfq.id,
        dto.buyerId,
      )
      if (!updated) {
        throw new ConflictError(
          `RFQ ${rfq.rfqNumber} was created, but this enquiry changed at the same time and was not linked to it. Link it manually.`,
        )
      }

      await events.emit(
        makeEvent({
          type: 'quote_request.promoted',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: {
            quoteRequestId: id,
            reference: updated.reference,
            rfqId: rfq.id,
            rfqNumber: rfq.rfqNumber,
          },
        }),
      )

      return { quoteRequest: updated, rfqId: rfq.id, rfqNumber: rfq.rfqNumber }
    },
  }
}

export type QuoteRequestService = ReturnType<typeof createQuoteRequestService>
