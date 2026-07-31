import { prisma } from '../client'

/**
 * Dashboard analytics (TRY-BNP-ADMIN-01).
 *
 * Live aggregates, not materialised summaries. The counts are grouped straight
 * off the source tables, so a chart can never disagree with the records it
 * describes - there is no refresh path to fall behind, and nothing to backfill.
 * At the volumes this platform holds, one grouped scan per dashboard load is
 * cheaper than the correctness risk of a cache.
 *
 * Every query is `date_trunc('month', ...)` over an organization-scoped filter.
 * Raw SQL is used because Prisma's groupBy cannot express a date truncation;
 * every value is parameterised, never interpolated.
 */

export interface MonthlyPoint {
  /** First day of the month, ISO date. */
  month: string
  count: number
}

export interface CountryPoint {
  country: string
  suppliers: number
}

export interface FunnelStage {
  stage: string
  count: number
}

export interface DashboardTrends {
  rfqs: MonthlyPoint[]
  quotations: MonthlyPoint[]
  supplierGrowth: MonthlyPoint[]
  topCountries: CountryPoint[]
  approvalFunnel: { rfqs: FunnelStage[]; quotations: FunnelStage[] }
  window: { months: number; from: string }
}

type MonthRow = { month: Date; count: bigint }

/** Months with no rows are absent from a GROUP BY; a chart needs them present. */
function fill(rows: MonthRow[], months: number, from: Date): MonthlyPoint[] {
  const byMonth = new Map(rows.map((r) => [r.month.toISOString().slice(0, 7), Number(r.count)]))
  const points: MonthlyPoint[] = []
  for (let i = 0; i < months; i += 1) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1))
    const key = d.toISOString().slice(0, 7)
    points.push({ month: `${key}-01`, count: byMonth.get(key) ?? 0 })
  }
  return points
}

export const analyticsRepository = {
  async trends(organizationId: string, months: number): Promise<DashboardTrends> {
    const now = new Date()
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1))

    // Three explicit queries rather than one helper with an interpolated table
    // name. Passing a table through `Prisma.sql` works under vitest but not once
    // Next bundles this module for the server runtime, and a chart that 500s in
    // the app while passing its tests is the worst of both. Written out, each
    // query is also readable on its own.
    const [rfqRows, quotationRows, supplierRows, countryRows, rfqFunnel, quoteFunnel] =
      await Promise.all([
        prisma.$queryRaw<MonthRow[]>`
          SELECT date_trunc('month', "createdAt") AS month, COUNT(*)::bigint AS count
          FROM "RFQ"
          WHERE "organizationId" = ${organizationId}
            AND "deletedAt" IS NULL
            AND "createdAt" >= ${from}
          GROUP BY 1
          ORDER BY 1
        `,
        prisma.$queryRaw<MonthRow[]>`
          SELECT date_trunc('month', "createdAt") AS month, COUNT(*)::bigint AS count
          FROM "Quotation"
          WHERE "organizationId" = ${organizationId}
            AND "deletedAt" IS NULL
            AND "createdAt" >= ${from}
          GROUP BY 1
          ORDER BY 1
        `,
        prisma.$queryRaw<MonthRow[]>`
          SELECT date_trunc('month', "createdAt") AS month, COUNT(*)::bigint AS count
          FROM "Supplier"
          WHERE "organizationId" = ${organizationId}
            AND "deletedAt" IS NULL
            AND "createdAt" >= ${from}
          GROUP BY 1
          ORDER BY 1
        `,
        prisma.$queryRaw<Array<{ country: string | null; suppliers: bigint }>>`
          SELECT "country", COUNT(*)::bigint AS suppliers
          FROM "Supplier"
          WHERE "organizationId" = ${organizationId}
            AND "deletedAt" IS NULL
            AND "country" IS NOT NULL
          GROUP BY "country"
          ORDER BY suppliers DESC, "country" ASC
          LIMIT 8
        `,
        prisma.$queryRaw<Array<{ status: string; count: bigint }>>`
          SELECT "status"::text AS status, COUNT(*)::bigint AS count
          FROM "RFQ"
          WHERE "organizationId" = ${organizationId} AND "deletedAt" IS NULL
          GROUP BY "status"
        `,
        prisma.$queryRaw<Array<{ status: string; count: bigint }>>`
          SELECT "status"::text AS status, COUNT(*)::bigint AS count
          FROM "Quotation"
          WHERE "organizationId" = ${organizationId} AND "deletedAt" IS NULL
          GROUP BY "status"
        `,
      ])

    // The funnel is ordered by the lifecycle, not by count, so a stage with
    // nothing in it still shows as a gap rather than vanishing.
    const stage = (rows: Array<{ status: string; count: bigint }>, order: string[]) =>
      order.map((s) => ({
        stage: s,
        count: Number(rows.find((r) => r.status === s)?.count ?? 0),
      }))

    return {
      rfqs: fill(rfqRows, months, from),
      quotations: fill(quotationRows, months, from),
      supplierGrowth: fill(supplierRows, months, from),
      topCountries: countryRows.map((r) => ({
        country: r.country ?? 'Unknown',
        suppliers: Number(r.suppliers),
      })),
      approvalFunnel: {
        rfqs: stage(rfqFunnel, ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED', 'AWARDED']),
        quotations: stage(quoteFunnel, [
          'DRAFT',
          'PENDING_APPROVAL',
          'APPROVED',
          'SENT',
          'ACCEPTED',
        ]),
      },
      window: { months, from: from.toISOString().slice(0, 10) },
    }
  },
}

export type AnalyticsRepository = typeof analyticsRepository
