'use client'

import {
  Alert,
  Badge,
  Card,
  CardContent,
  DataTable,
  DataTableCell,
  DataTableHead,
  DataTableRow,
  EmptyState,
} from '@triyara/ui'
import { Receipt } from 'lucide-react'

import { formatMoney, formatPercent, type Quotation } from '../types'
import { humanise } from './humanise'

/**
 * The stored totals, exactly as the API reports them.
 *
 * Nothing here is computed in the browser. The service is the only thing that
 * prices a quotation, and a second implementation in the UI would eventually
 * disagree with it - on rounding, on compound tax, on whether a discount is
 * taxable. Every figure below is a value that arrived over the wire.
 */
export function QuotationTotals({ quotation }: { quotation: Quotation }) {
  const rows: Array<{ label: string; value: string | null; strong?: boolean; muted?: boolean }> = [
    { label: 'Subtotal', value: quotation.subtotal },
    { label: 'Charges', value: quotation.chargesTotal },
    { label: 'Discounts', value: quotation.discountTotal, muted: true },
    { label: 'Tax', value: quotation.taxTotal },
  ]

  return (
    <Card className="max-w-sm">
      <CardContent className="py-gap-lg">
        <dl className="grid gap-gap">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-gap-lg">
              <dt className="text-xs text-content-muted">{row.label}</dt>
              <dd
                className={`text-base tabular-nums ${row.muted ? 'text-content-muted' : 'text-content'}`}
              >
                {row.muted && row.value && Number(row.value) > 0 ? '−' : ''}
                {formatMoney(row.value, quotation.currency)}
              </dd>
            </div>
          ))}
          {/* Separation is a border on the group, not a <Separator> element:
              a <dl> may only contain dt, dd, div, script and template, so an
              <hr> in here is an accessibility failure (axe: definition-list). */}
          <div className="flex items-baseline justify-between gap-gap-lg border-t border-line pt-gap">
            <dt className="text-base font-medium text-content">Total</dt>
            <dd className="text-lg font-semibold tabular-nums text-content">
              {formatMoney(quotation.grandTotal, quotation.currency)}
            </dd>
          </div>

          {/* Cost and margin are null for anyone who cannot `manage Account`.
              The rows are omitted rather than shown empty: an empty margin
              field invites the reader to wonder what the number is. */}
          {quotation.marginPercent !== null || quotation.costTotal !== null ? (
            <>
              <div className="flex items-baseline justify-between gap-gap-lg border-t border-line pt-gap">
                <dt className="text-xs text-content-muted">Cost</dt>
                <dd className="text-base tabular-nums text-content-muted">
                  {formatMoney(quotation.costTotal, quotation.currency)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-gap-lg">
                <dt className="text-xs text-content-muted">Margin</dt>
                <dd className="text-base tabular-nums text-content-muted">
                  {formatPercent(quotation.marginPercent)}
                </dd>
              </div>
            </>
          ) : null}
        </dl>

        {quotation.fxRate && quotation.currency !== quotation.baseCurrency ? (
          <p className="mt-gap-lg text-2xs text-content-subtle">
            Quoted in {quotation.currency}; base {quotation.baseCurrency} at {quotation.fxRate}.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function QuotationCharges({ quotation }: { quotation: Quotation }) {
  if (quotation.charges.length === 0)
    return (
      <EmptyState
        size="sm"
        icon={<Receipt />}
        title="No charges"
        description="Freight, insurance, handling and discounts appear here once added."
      />
    )

  const lineLabel = (itemId: string | null) => {
    if (!itemId) return 'Whole quotation'
    const item = quotation.items.find((i) => i.id === itemId)
    return item ? `Line ${item.lineNumber}` : 'Unknown line'
  }

  return (
    <Card>
      <CardContent className="p-0">
        <DataTable caption="Charges and discounts">
          <DataTableHead>
            <tr>
              <th scope="col">Type</th>
              <th scope="col">Applies to</th>
              <th scope="col">Basis</th>
              <th scope="col">Amount</th>
              <th scope="col">Customer sees</th>
            </tr>
          </DataTableHead>
          <tbody>
            {quotation.charges.map((charge) => (
              <DataTableRow key={charge.id}>
                <DataTableCell className="font-medium">
                  {charge.label ?? humanise(charge.type)}
                  {charge.isDeduction ? (
                    <Badge tone="success" size="sm" className="ml-gap">
                      Deduction
                    </Badge>
                  ) : null}
                </DataTableCell>
                <DataTableCell className="text-content-muted">
                  {lineLabel(charge.quotationItemId)}
                </DataTableCell>
                <DataTableCell className="text-content-muted">
                  {humanise(charge.basis)}
                  {charge.rate ? ` · ${charge.rate}` : ''}
                </DataTableCell>
                <DataTableCell className="font-medium tabular-nums">
                  {charge.isDeduction ? '−' : ''}
                  {formatMoney(charge.amount, charge.currency)}
                </DataTableCell>
                <DataTableCell>
                  {charge.isVisibleToCustomer ? (
                    <span className="text-content-muted">Yes</span>
                  ) : (
                    <Badge tone="neutral" size="sm">
                      Internal
                    </Badge>
                  )}
                </DataTableCell>
              </DataTableRow>
            ))}
          </tbody>
        </DataTable>
      </CardContent>
    </Card>
  )
}

export function QuotationTaxes({ quotation }: { quotation: Quotation }) {
  if (quotation.taxes.length === 0)
    return (
      <EmptyState
        size="sm"
        icon={<Receipt />}
        title="No taxes"
        description="GST, VAT and duties appear here once added."
      />
    )

  return (
    <div className="space-y-gap-lg">
      {/* The single most surprising behaviour in this module, so it is stated
          rather than left to be discovered by a puzzled user. */}
      <Alert tone="info" title="Tax is computed, not entered">
        Amounts below are calculated by applying each rate to the taxable base at the time the
        quotation was priced. A rate change re-prices the quotation; the amounts here cannot be
        edited directly.
      </Alert>

      <Card>
        <CardContent className="p-0">
          <DataTable caption="Taxes">
            <DataTableHead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Jurisdiction</th>
                <th scope="col">Rate</th>
                <th scope="col">Taxable</th>
                <th scope="col">Amount</th>
              </tr>
            </DataTableHead>
            <tbody>
              {quotation.taxes.map((tax) => (
                <DataTableRow key={tax.id}>
                  <DataTableCell className="font-medium">
                    {humanise(tax.type)}
                    {tax.code ? (
                      <span className="ml-gap font-mono text-2xs text-content-subtle">
                        {tax.code}
                      </span>
                    ) : null}
                    {tax.isCompound ? (
                      <Badge tone="neutral" size="sm" className="ml-gap">
                        Compound
                      </Badge>
                    ) : null}
                    {tax.isReverseCharge ? (
                      <Badge tone="warning" size="sm" className="ml-gap">
                        Reverse charge
                      </Badge>
                    ) : null}
                  </DataTableCell>
                  <DataTableCell className="text-content-muted">
                    {tax.jurisdiction ?? '—'}
                  </DataTableCell>
                  <DataTableCell className="tabular-nums text-content-muted">
                    {formatPercent(tax.ratePercent)}
                  </DataTableCell>
                  <DataTableCell className="tabular-nums text-content-muted">
                    {formatMoney(tax.taxableAmount, tax.currency)}
                  </DataTableCell>
                  <DataTableCell className="font-medium tabular-nums">
                    {formatMoney(tax.amount, tax.currency)}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </tbody>
          </DataTable>
        </CardContent>
      </Card>
    </div>
  )
}
