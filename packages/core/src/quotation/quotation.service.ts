import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  ChargeData,
  MutationCtx,
  QuotationItemData,
  QuotationListResult,
  QuotationRecord,
  QuotationReferenceRepository,
  QuotationRepository,
  QuotationSourcingRepository,
  QuotationTotals,
  TaxData,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { ConflictError, NotFoundError, ValidationError } from '@triyara/lib'
import type {
  CreateQuotationDto,
  ListQuotationsQuery,
  QuotationApprovalDto,
  QuotationChargeDto,
  QuotationTaxDto,
  ReplaceQuotationItemsDto,
  ReviseQuotationDto,
  UpdateQuotationDto,
} from '@triyara/validation'

import {
  priceQuotation,
  type PricingCharge,
  type PricingLine,
  type PricingTax,
} from './quotation-pricing'

/** The header-scoped condition rows as they stand before a re-price. */
type ConditionRows = Awaited<ReturnType<QuotationSourcingRepository['listConditions']>>

/**
 * Condition rows carrying the figures the pricing engine actually resolved.
 *
 * Written back after every re-price so a stored row can never state one number
 * while the header states another - the document contradicting itself is worse
 * than either figure being wrong, because a reader cannot tell which to trust.
 */
interface RepricedConditions {
  charges: ChargeData[]
  taxes: TaxData[]
}

// Quotation service (TRY-BNP-QUOTE-01).
//
// Authorization reuses the frozen CASL subjects - no new subject is introduced.
// A quotation is a commercial record governed as `Account`, exactly as the RFQ
// module does:
//   read   Account -> every role
//   create/update  -> ADMIN and EXPORT_MANAGER
//   manage         -> ADMIN only, used for approval decisions and margin data
//
// Three rules distinguish a quotation from an RFQ and drive most of this file:
//   1. Priced totals are COMPUTED here and PERSISTED, never recomputed on read.
//   2. Once SENT, a quotation is immutable - changes require a new revision.
//   3. Cost and margin are internal; exposing them needs `manage Account`.

export type QuotationServiceCtx = AuthContext & { requestId?: string }

export interface QuotationServiceDeps {
  repo: QuotationRepository
  sourcing: QuotationSourcingRepository
  reference: QuotationReferenceRepository
  events: EventBus
  /** Grand totals at or above this figure require ADMIN approval. */
  approvalThreshold?: number
  /** A quotation priced below this margin requires ADMIN approval. */
  minMarginPercent?: number
}

/**
 * Legal quotation transitions. Anything not listed is rejected, so the workflow
 * cannot be walked into an inconsistent state by a malformed request.
 */
const TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ['PENDING_APPROVAL', 'APPROVED', 'WITHDRAWN'],
  PENDING_APPROVAL: ['APPROVED', 'DRAFT', 'REJECTED', 'WITHDRAWN'],
  APPROVED: ['SENT', 'DRAFT', 'WITHDRAWN'],
  SENT: ['UNDER_NEGOTIATION', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN'],
  UNDER_NEGOTIATION: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN', 'SUPERSEDED'],
  // Terminal states. SUPERSEDED is reached only through revise(), never by hand.
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: ['WITHDRAWN'],
  WITHDRAWN: [],
  SUPERSEDED: [],
}

/** Approval decision -> the quotation status it drives. */
const DECISION_TARGET: Record<string, string> = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'WITHDRAWN',
}

/** After SENT the document is a commitment: edits must go through a revision. */
const EDITABLE_STATUSES = new Set(['DRAFT', 'PENDING_APPROVAL', 'APPROVED'])

const DEFAULT_APPROVAL_THRESHOLD = 1_000_000
const DEFAULT_MIN_MARGIN_PERCENT = 10

function mutationCtx(ctx: QuotationServiceCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

/** Prisma Decimal, number and null all reach here; normalise to number. */
function num(value: unknown): number {
  if (value === null || value === undefined) return 0
  return typeof value === 'number' ? value : Number(value.toString())
}

export function createQuotationService({
  repo,
  sourcing,
  reference,
  events,
  approvalThreshold = DEFAULT_APPROVAL_THRESHOLD,
  minMarginPercent = DEFAULT_MIN_MARGIN_PERCENT,
}: QuotationServiceDeps) {
  async function emit(ctx: QuotationServiceCtx, type: string, data: Record<string, unknown>) {
    await events.emit(
      makeEvent({ type, organizationId: ctx.organizationId, actorId: ctx.user.id, data }),
    )
  }

  /** Each line is a catalog product or a free-text offer, never neither. */
  function assertItemsWellFormed(
    items: ReadonlyArray<{ productId?: string; customProductName?: string; unitPrice: number }>,
  ) {
    items.forEach((it, i) => {
      if (!it.productId && !it.customProductName) {
        throw new ValidationError(`Line ${i + 1} needs either productId or customProductName.`)
      }
      if (it.unitPrice <= 0) {
        throw new ValidationError(`Line ${i + 1} needs a unit price above zero.`)
      }
    })
  }

  function assertValidityWindow(validFrom?: Date, validUntil?: Date) {
    if (validFrom && validUntil && validUntil <= validFrom) {
      throw new ValidationError('validUntil must fall after validFrom.')
    }
  }

  /**
   * A quotation quoted in a currency other than its base needs a rate, and that
   * rate is FROZEN onto the document. Re-reading a sent quotation must never
   * produce a different figure because the market moved.
   */
  async function freezeFxRate(
    organizationId: string,
    currency: string,
    baseCurrency: string,
    on: Date,
  ): Promise<{ fxRate?: number; fxRateDate?: Date }> {
    if (currency === baseCurrency) return { fxRate: 1, fxRateDate: on }
    const rate = await reference.findRateOn(organizationId, currency, baseCurrency, on)
    if (!rate) {
      throw new ValidationError(
        `No exchange rate is on file for ${currency}/${baseCurrency} on ${on.toISOString().slice(0, 10)}.`,
      )
    }
    return { fxRate: num(rate.rate), fxRateDate: rate.effectiveFrom }
  }

  /** Prices the lines against the quotation's stored conditions. */
  async function computeTotals(
    organizationId: string,
    quotationId: string | null,
    items: QuotationItemData[],
  ): Promise<QuotationTotals & { repriced: RepricedConditions | null }> {
    const lines: PricingLine[] = items.map((it, i) => ({
      ref: String(i + 1),
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      ...(it.unitCost === undefined ? {} : { unitCost: it.unitCost }),
    }))

    let charges: PricingCharge[] = []
    let taxes: PricingTax[] = []
    // The surviving rows are kept so the resolved figures can be written back
    // onto them. Re-pricing against new lines changes what a percentage charge
    // or any tax is worth, and a row left at its old amount would contradict
    // the totals it just helped produce.
    let survivingCharges: ConditionRows['charges'] = []
    let survivingTaxes: ConditionRows['taxes'] = []

    if (quotationId) {
      const conditions = await sourcing.listConditions(organizationId, quotationId)
      // Existing conditions are keyed by line id, but a replacement changes the
      // ids, so only header-scoped conditions survive a line replacement.
      survivingCharges = conditions.charges.filter((c) => !c.quotationItemId)
      survivingTaxes = conditions.taxes.filter((t) => !t.quotationItemId)
      charges = survivingCharges.map((c, i) => ({
        ref: String(i),
        basis: c.basis,
        rate: c.rate === null ? undefined : num(c.rate),
        amount: num(c.amount),
        isDeduction: c.isDeduction,
        sequence: c.sequence,
      }))
      taxes = survivingTaxes.map((t, i) => ({
        ref: String(i),
        ratePercent: num(t.ratePercent),
        isCompound: t.isCompound,
        isReverseCharge: t.isReverseCharge,
        sequence: t.sequence,
      }))
    }

    const result = priceQuotation(lines, charges, taxes)

    // Paired by ref, never by position: charges come back line-scoped first.
    const chargeAmounts = new Map(result.charges.map((c) => [c.ref, c.resolvedAmount]))
    const taxFigures = new Map(
      result.taxes.map((t) => [t.ref, { amount: t.resolvedAmount, base: t.resolvedTaxableAmount }]),
    )

    const repriced: RepricedConditions | null =
      survivingCharges.length > 0 || survivingTaxes.length > 0
        ? {
            charges: survivingCharges.map((c, i) => ({
              quotationItemId: null,
              type: c.type,
              scope: c.scope,
              basis: c.basis,
              ...(c.label === null ? {} : { label: c.label }),
              ...(c.rate === null ? {} : { rate: num(c.rate) }),
              amount: chargeAmounts.get(String(i)) ?? num(c.amount),
              currency: c.currency,
              isDeduction: c.isDeduction,
              sequence: c.sequence,
              isVisibleToCustomer: c.isVisibleToCustomer,
            })),
            taxes: survivingTaxes.map((t, i) => {
              const resolved = taxFigures.get(String(i))
              return {
                quotationItemId: null,
                type: t.type,
                ...(t.code === null ? {} : { code: t.code }),
                ...(t.jurisdiction === null ? {} : { jurisdiction: t.jurisdiction }),
                ratePercent: num(t.ratePercent),
                taxableAmount: resolved?.base ?? num(t.taxableAmount),
                amount: resolved?.amount ?? num(t.amount),
                currency: t.currency,
                isCompound: t.isCompound,
                isReverseCharge: t.isReverseCharge,
                sequence: t.sequence,
              }
            }),
          }
        : null

    return {
      repriced,
      subtotal: result.subtotal,
      chargesTotal: result.chargesTotal,
      discountTotal: result.discountTotal,
      taxTotal: result.taxTotal,
      grandTotal: result.grandTotal,
      costTotal: result.costTotal,
      marginPercent: result.marginPercent,
    }
  }

  /**
   * Whether a quotation may be approved by this actor. Above the value threshold
   * or below the margin floor, only ADMIN (`manage Account`) may approve.
   */
  function assertApprovalAuthority(
    ctx: QuotationServiceCtx,
    grandTotal: number,
    margin: number | null,
  ) {
    const highValue = grandTotal >= approvalThreshold
    const thinMargin = margin !== null && margin < minMarginPercent
    if (highValue || thinMargin) {
      assertAbility(ctx, 'manage', 'Account')
    }
  }

  /** Strips internal cost and margin unless the actor may see them. */
  function redact(ctx: QuotationServiceCtx, quotation: QuotationRecord): QuotationRecord {
    if (ctx.ability.can('manage', 'Account')) return quotation
    return {
      ...quotation,
      costTotal: null,
      marginPercent: null,
      items: quotation.items.map((it) => ({ ...it, unitCost: null, marginPercent: null })),
    } as QuotationRecord
  }

  function toItemData(dto: ReplaceQuotationItemsDto['items']): QuotationItemData[] {
    return dto.map((it) => ({
      productId: it.productId ?? null,
      customProductName: it.customProductName ?? null,
      description: it.description,
      rfqItemId: it.rfqItemId ?? null,
      quantity: it.quantity,
      unit: it.unit,
      unitCost: it.unitCost,
      marginPercent: it.marginPercent,
      unitPrice: it.unitPrice,
      packaging: it.packaging,
      hsCode: it.hsCode,
      countryOfOrigin: it.countryOfOrigin,
      requiredCertifications: it.requiredCertifications,
      leadTimeDays: it.leadTimeDays,
      remarks: it.remarks,
    }))
  }

  async function load(ctx: QuotationServiceCtx, id: string): Promise<QuotationRecord> {
    assertAbility(ctx, 'read', 'Account')
    const quotation = await repo.findById(ctx.organizationId, id)
    if (!quotation) throw new NotFoundError('Quotation not found.')
    return quotation
  }

  return {
    async list(ctx: QuotationServiceCtx, query: ListQuotationsQuery): Promise<QuotationListResult> {
      assertAbility(ctx, 'read', 'Account')
      return repo.list({
        organizationId: ctx.organizationId,
        q: query.q,
        type: query.type,
        status: query.status,
        buyerId: query.buyerId,
        rfqId: query.rfqId,
        currency: query.currency,
        currentOnly: query.currentOnly === 'true',
        validBefore: query.validBefore,
        validAfter: query.validAfter,
        includeDeleted: query.includeDeleted === 'true',
        sort: query.sort,
        limit: query.limit,
        cursor: query.cursor,
      })
    },

    async get(ctx: QuotationServiceCtx, id: string): Promise<QuotationRecord> {
      return redact(ctx, await load(ctx, id))
    },

    /** Every revision of one quotation number, oldest first. */
    async history(ctx: QuotationServiceCtx, quotationNumber: string) {
      assertAbility(ctx, 'read', 'Account')
      return repo.revisionChain(ctx.organizationId, quotationNumber)
    },

    async create(
      ctx: QuotationServiceCtx,
      dto: CreateQuotationDto,
      itemsDto: ReplaceQuotationItemsDto,
    ): Promise<QuotationRecord> {
      assertAbility(ctx, 'create', 'Account')
      assertItemsWellFormed(itemsDto.items)
      assertValidityWindow(dto.validFrom, dto.validUntil)

      const items = toItemData(itemsDto.items)
      const fx = await freezeFxRate(
        ctx.organizationId,
        dto.currency,
        dto.baseCurrency,
        dto.validFrom ?? new Date(),
      )
      // No quotation id yet, so only line arithmetic applies; conditions are
      // added afterwards and re-price the document then.
      // No quotationId yet, so there are no stored conditions to re-price.
      const { repriced: _unpriced, ...totals } = await computeTotals(
        ctx.organizationId,
        null,
        items,
      )

      const quotation = await repo.create(mutationCtx(ctx), { ...dto, ...fx }, items, totals)
      await emit(ctx, 'quotation.created', {
        quotationId: quotation.id,
        quotationNumber: quotation.quotationNumber,
        grandTotal: num(quotation.grandTotal),
      })
      return redact(ctx, quotation)
    },

    async update(
      ctx: QuotationServiceCtx,
      id: string,
      expectedVersion: number,
      dto: UpdateQuotationDto,
    ): Promise<QuotationRecord> {
      assertAbility(ctx, 'update', 'Account')
      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('Quotation not found.')
      if (!EDITABLE_STATUSES.has(current.status)) {
        throw new ConflictError(
          `A ${current.status} quotation cannot be edited. Create a revision instead.`,
        )
      }
      assertValidityWindow(
        dto.validFrom ?? current.validFrom ?? undefined,
        dto.validUntil ?? current.validUntil ?? undefined,
      )

      // A currency change invalidates the frozen rate, so re-freeze it.
      const currency = dto.currency ?? current.currency
      const baseCurrency = dto.baseCurrency ?? current.baseCurrency
      const fx =
        dto.currency || dto.baseCurrency
          ? await freezeFxRate(
              ctx.organizationId,
              currency,
              baseCurrency,
              dto.validFrom ?? current.validFrom ?? new Date(),
            )
          : {}

      const updated = await repo.mutate(mutationCtx(ctx), id, expectedVersion, { ...dto, ...fx })
      await emit(ctx, 'quotation.updated', { quotationId: id })
      return redact(ctx, updated)
    },

    /**
     * Replaces every line and re-prices the document. Header conditions carry
     * over; line conditions do not, because their target lines no longer exist.
     */
    async replaceItems(
      ctx: QuotationServiceCtx,
      id: string,
      expectedVersion: number,
      dto: ReplaceQuotationItemsDto,
    ): Promise<QuotationRecord> {
      assertAbility(ctx, 'update', 'Account')
      assertItemsWellFormed(dto.items)
      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('Quotation not found.')
      if (!EDITABLE_STATUSES.has(current.status)) {
        throw new ConflictError(
          `Lines on a ${current.status} quotation are frozen. Create a revision instead.`,
        )
      }

      const items = toItemData(dto.items)
      const { repriced, ...totals } = await computeTotals(ctx.organizationId, id, items)
      const updated = await repo.replaceItems(mutationCtx(ctx), id, expectedVersion, items, totals)

      // Replacing the lines moves the base every header charge and tax is
      // levied on, so their stored rows have to be rewritten at the figures the
      // re-price produced. Done after the line replacement, because that is
      // what drops the line-scoped rows these headers are replacing.
      if (repriced) {
        await sourcing.replaceConditions(mutationCtx(ctx), id, repriced.charges, repriced.taxes)
      }

      await emit(ctx, 'quotation.items_replaced', {
        quotationId: id,
        lines: items.length,
        grandTotal: totals.grandTotal,
      })
      return redact(ctx, updated)
    },

    /**
     * Replaces charges and taxes, then re-prices. The conditions define the
     * price, so persisting them without re-pricing would leave stored totals
     * disagreeing with their own inputs.
     */
    async setConditions(
      ctx: QuotationServiceCtx,
      id: string,
      expectedVersion: number,
      charges: QuotationChargeDto[],
      taxes: QuotationTaxDto[],
    ): Promise<QuotationRecord> {
      assertAbility(ctx, 'update', 'Account')
      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('Quotation not found.')
      if (!EDITABLE_STATUSES.has(current.status)) {
        throw new ConflictError(
          `Pricing on a ${current.status} quotation is frozen. Create a revision instead.`,
        )
      }

      const lineIds = new Set(current.items.map((it) => it.id))
      for (const c of charges) {
        if (c.quotationItemId && !lineIds.has(c.quotationItemId)) {
          throw new ValidationError(`Charge targets a line that is not on this quotation.`)
        }
      }
      for (const t of taxes) {
        if (t.quotationItemId && !lineIds.has(t.quotationItemId)) {
          throw new ValidationError(`Tax targets a line that is not on this quotation.`)
        }
      }

      // Price BEFORE persisting. The conditions define the price, so a row has
      // to be stored carrying the figure that actually went into the totals -
      // otherwise the document contradicts itself, and a reader has no way to
      // tell which number is real. The submitted `amount` and `taxableAmount`
      // are inputs at most: a PERCENTAGE charge is derived from its rate, and a
      // header tax is always levied on the running total.
      const lines: PricingLine[] = current.items.map((it) => ({
        ref: it.id,
        quantity: num(it.quantity),
        unitPrice: num(it.unitPrice),
        ...(it.unitCost === null ? {} : { unitCost: num(it.unitCost) }),
      }))
      const priced = priceQuotation(
        lines,
        charges.map((c, i) => ({
          ref: String(i),
          lineRef: c.quotationItemId ?? null,
          basis: c.basis,
          rate: c.rate,
          amount: c.amount,
          isDeduction: c.isDeduction,
          sequence: c.sequence,
        })),
        taxes.map((t, i) => ({
          ref: String(i),
          lineRef: t.quotationItemId ?? null,
          ratePercent: t.ratePercent,
          isCompound: t.isCompound,
          isReverseCharge: t.isReverseCharge,
          sequence: t.sequence,
        })),
      )

      // Paired by ref, not by position: charges come back line-scoped first.
      const chargeAmounts = new Map(priced.charges.map((c) => [c.ref, c.resolvedAmount]))
      const taxFigures = new Map(
        priced.taxes.map((t) => [
          t.ref,
          { amount: t.resolvedAmount, base: t.resolvedTaxableAmount },
        ]),
      )

      await sourcing.replaceConditions(
        mutationCtx(ctx),
        id,
        charges.map((c, i) => ({
          ...c,
          quotationItemId: c.quotationItemId ?? null,
          amount: chargeAmounts.get(String(i)) ?? c.amount,
        })),
        taxes.map((t, i) => {
          const resolved = taxFigures.get(String(i))
          return {
            ...t,
            quotationItemId: t.quotationItemId ?? null,
            ...(resolved ? { amount: resolved.amount, taxableAmount: resolved.base } : {}),
          }
        }),
      )

      const updated = await repo.mutate(
        mutationCtx(ctx),
        id,
        expectedVersion,
        {},
        {
          subtotal: priced.subtotal,
          chargesTotal: priced.chargesTotal,
          discountTotal: priced.discountTotal,
          taxTotal: priced.taxTotal,
          grandTotal: priced.grandTotal,
          costTotal: priced.costTotal,
          marginPercent: priced.marginPercent,
        },
      )
      await emit(ctx, 'quotation.repriced', {
        quotationId: id,
        grandTotal: priced.grandTotal,
        taxTotal: priced.taxTotal,
      })
      return redact(ctx, updated)
    },

    /**
     * Moves the quotation through its lifecycle. Approval beyond the value or
     * margin threshold demands ADMIN; SUPERSEDED is unreachable by hand.
     */
    async transition(
      ctx: QuotationServiceCtx,
      id: string,
      expectedVersion: number,
      dto: QuotationApprovalDto,
    ): Promise<QuotationRecord> {
      assertAbility(ctx, 'update', 'Account')
      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('Quotation not found.')

      const target = DECISION_TARGET[dto.decision]
      if (!target) throw new ValidationError(`Unsupported decision ${dto.decision}.`)
      const allowed = TRANSITIONS[current.status] ?? []
      if (!allowed.includes(target)) {
        throw new ConflictError(`A ${current.status} quotation cannot move to ${target}.`)
      }

      const grandTotal = num(current.grandTotal)
      const margin = current.marginPercent === null ? null : num(current.marginPercent)
      if (target === 'APPROVED') {
        assertApprovalAuthority(ctx, grandTotal, margin)
      }

      const updated = await repo.transition(
        mutationCtx(ctx),
        id,
        expectedVersion,
        target as Parameters<QuotationRepository['transition']>[3],
        dto.decision,
        dto.comments,
        approvalThreshold,
      )
      await emit(ctx, `quotation.${target.toLowerCase()}`, {
        quotationId: id,
        fromStatus: current.status,
        toStatus: target,
        grandTotal,
      })
      return redact(ctx, updated)
    },

    /** Marks an APPROVED quotation as sent to the buyer, freezing it. */
    async send(
      ctx: QuotationServiceCtx,
      id: string,
      expectedVersion: number,
    ): Promise<QuotationRecord> {
      assertAbility(ctx, 'update', 'Account')
      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('Quotation not found.')
      if (!(TRANSITIONS[current.status] ?? []).includes('SENT')) {
        throw new ConflictError(`A ${current.status} quotation cannot be sent.`)
      }
      if (current.items.length === 0) {
        throw new ValidationError('A quotation with no lines cannot be sent.')
      }
      if (!current.validUntil) {
        throw new ValidationError('A quotation must carry a validity date before it is sent.')
      }

      const updated = await repo.transition(
        mutationCtx(ctx),
        id,
        expectedVersion,
        'SENT',
        'APPROVED',
        'Sent to buyer.',
      )
      await emit(ctx, 'quotation.sent', {
        quotationId: id,
        buyerId: current.buyerId,
        grandTotal: num(current.grandTotal),
        validUntil: current.validUntil,
      })
      return redact(ctx, updated)
    },

    /**
     * Records the buyer accepting the quotation. Separate from `transition`
     * because no approval decision maps to ACCEPTED - DECISION_TARGET stops at
     * WITHDRAWN, so an accepted offer could otherwise never be recorded. The
     * legal predecessors come from the same TRANSITIONS table, not a second copy
     * of the rules.
     */
    async accept(
      ctx: QuotationServiceCtx,
      id: string,
      expectedVersion: number,
      comments?: string,
    ): Promise<QuotationRecord> {
      assertAbility(ctx, 'update', 'Account')
      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('Quotation not found.')
      if (!(TRANSITIONS[current.status] ?? []).includes('ACCEPTED')) {
        throw new ConflictError(
          `A ${current.status} quotation cannot be accepted. Allowed from here: ${
            (TRANSITIONS[current.status] ?? []).join(', ') || 'none'
          }.`,
        )
      }

      // QuotationApprovalStatus has no ACCEPTED member, so the approval row
      // records APPROVED: the buyer sanctioned the document.
      const updated = await repo.transition(
        mutationCtx(ctx),
        id,
        expectedVersion,
        'ACCEPTED',
        'APPROVED',
        comments ?? 'Accepted by the buyer.',
      )
      await emit(ctx, 'quotation.accepted', {
        quotationId: id,
        buyerId: current.buyerId,
        grandTotal: num(current.grandTotal),
      })
      return redact(ctx, updated)
    },

    /**
     * Lapses a quotation whose validity has run out. Deliberately explicit
     * rather than inferred from `validUntil` on read: a quotation is a
     * commercial commitment, and when it stopped being one is a fact worth
     * recording with an actor and a timestamp, not recomputing per request.
     */
    async expire(
      ctx: QuotationServiceCtx,
      id: string,
      expectedVersion: number,
      comments?: string,
    ): Promise<QuotationRecord> {
      assertAbility(ctx, 'update', 'Account')
      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('Quotation not found.')
      if (!(TRANSITIONS[current.status] ?? []).includes('EXPIRED')) {
        throw new ConflictError(
          `A ${current.status} quotation cannot expire. Allowed from here: ${
            (TRANSITIONS[current.status] ?? []).join(', ') || 'none'
          }.`,
        )
      }

      // CANCELLED is the closest approval-chain marker: the offer is no longer
      // live. REJECTED would misrepresent a lapse as a buyer decision.
      const updated = await repo.transition(
        mutationCtx(ctx),
        id,
        expectedVersion,
        'EXPIRED',
        'CANCELLED',
        comments ?? 'Validity period elapsed.',
      )
      await emit(ctx, 'quotation.expired', {
        quotationId: id,
        validUntil: current.validUntil,
      })
      return redact(ctx, updated)
    },

    /**
     * Supersedes the current document and opens revision n+1. The superseded row
     * IS the historical snapshot, so nothing is copied or serialised.
     */
    async revise(
      ctx: QuotationServiceCtx,
      id: string,
      expectedVersion: number,
      itemsDto: ReplaceQuotationItemsDto,
      dto: ReviseQuotationDto,
    ): Promise<QuotationRecord> {
      assertAbility(ctx, 'update', 'Account')
      assertItemsWellFormed(itemsDto.items)
      const current = await repo.findById(ctx.organizationId, id)
      if (!current) throw new NotFoundError('Quotation not found.')
      if (current.supersededAt) {
        throw new ConflictError('This revision has already been superseded.')
      }

      const items = toItemData(itemsDto.items)
      // The successor's condition rows are written by repo.revise, so the
      // re-priced rows for THIS quotation are not applicable here.
      const { repriced: _superseded, ...totals } = await computeTotals(
        ctx.organizationId,
        id,
        items,
      )
      const next = await repo.revise(
        mutationCtx(ctx),
        id,
        expectedVersion,
        items,
        totals,
        dto.reason,
      )
      await emit(ctx, 'quotation.revised', {
        quotationId: next.id,
        supersededId: id,
        revisionNumber: next.revisionNumber,
        reason: dto.reason,
      })
      return redact(ctx, next)
    },

    async approvalHistory(ctx: QuotationServiceCtx, id: string) {
      assertAbility(ctx, 'read', 'Account')
      return repo.approvalHistory(ctx.organizationId, id)
    },

    async revisionHistory(ctx: QuotationServiceCtx, id: string) {
      assertAbility(ctx, 'read', 'Account')
      return repo.revisionHistory(ctx.organizationId, id)
    },

    /** Withdraws rather than erases: a quotation seen by a buyer is a record. */
    async remove(
      ctx: QuotationServiceCtx,
      id: string,
      expectedVersion: number,
    ): Promise<QuotationRecord> {
      assertAbility(ctx, 'delete', 'Account')
      const removed = await repo.softDelete(mutationCtx(ctx), id, expectedVersion)
      await emit(ctx, 'quotation.withdrawn', { quotationId: id })
      return redact(ctx, removed)
    },

    async restore(
      ctx: QuotationServiceCtx,
      id: string,
      expectedVersion: number,
    ): Promise<QuotationRecord> {
      assertAbility(ctx, 'manage', 'Account')
      const restored = await repo.restore(mutationCtx(ctx), id, expectedVersion)
      await emit(ctx, 'quotation.restored', { quotationId: id })
      return redact(ctx, restored)
    },
  }
}

export type QuotationService = ReturnType<typeof createQuotationService>
