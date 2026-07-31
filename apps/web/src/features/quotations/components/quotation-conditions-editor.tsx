'use client'

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  useToast,
} from '@triyara/ui'
import { CHARGE_TYPES, TAX_TYPES } from '@triyara/validation'
import { Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { InlineQueryError } from '@/components/data/query-boundary'
import { describeApiError } from '@/lib/api-error'

import { useQuotation, useSetConditions } from '../api/quotations'
import { isEditable } from '../types'
import { humanise } from './humanise'
import { useDirtyGuard } from './use-dirty-guard'

interface ChargeRow {
  key: string
  type: string
  label: string
  amount: string
  isDeduction: boolean
}
interface TaxRow {
  key: string
  type: string
  ratePercent: string
  jurisdiction: string
}

const newKey = () => Math.random().toString(36).slice(2)

/**
 * Charges and taxes (§9).
 *
 * One screen and one save, because the API sets them together and re-totals
 * once. Clearing a collection means submitting it empty, which is what the
 * endpoint expects.
 *
 * Two deliberate omissions:
 *
 *  - No tax `amount` field. The service recomputes tax as rate x taxable base
 *    and discards any amount submitted with it, so a box to type one in would
 *    be a lie. The rate is what the user controls.
 *  - No running total. Pricing is the server's job; a number computed here
 *    would eventually disagree with the stored one on rounding or compounding.
 *    The recomputed totals arrive in the save response.
 */
export function QuotationConditionsEditor({ id }: { id: string }) {
  const router = useRouter()
  const toast = useToast()
  const query = useQuotation(id)
  const save = useSetConditions(id)

  const [charges, setCharges] = useState<ChargeRow[] | null>(null)
  const [taxes, setTaxes] = useState<TaxRow[] | null>(null)
  const [dirty, setDirty] = useState(false)

  useDirtyGuard(dirty && !save.isPending)

  if (query.isPending)
    return (
      <div className="p-gutter" aria-busy="true">
        <Skeleton variant="text" className="h-6 w-64" />
        <Skeleton className="mt-gap-lg h-40 w-full" />
      </div>
    )

  if (query.isError)
    return (
      <div className="p-gutter">
        <InlineQueryError error={query.error} onRetry={() => void query.refetch()} />
      </div>
    )

  const { quotation, version } = query.data
  const frozen = !isEditable(quotation.status)

  // Seed from the server on first render, then let local edits own the state.
  const chargeRows: ChargeRow[] =
    charges ??
    quotation.charges.map((c) => ({
      key: c.id,
      type: c.type,
      label: c.label ?? '',
      amount: c.amount,
      isDeduction: c.isDeduction,
    }))
  const taxRows: TaxRow[] =
    taxes ??
    quotation.taxes.map((t) => ({
      key: t.id,
      type: t.type,
      ratePercent: t.ratePercent,
      jurisdiction: t.jurisdiction ?? '',
    }))

  const mutate = <T,>(setter: (rows: T[]) => void, rows: T[]) => {
    setter(rows)
    setDirty(true)
  }

  async function onSave() {
    try {
      await save.mutateAsync({
        version,
        charges: chargeRows
          .filter((c) => c.amount !== '')
          .map((c, index) => ({
            type: c.type as never,
            scope: 'HEADER' as const,
            basis: 'FIXED_AMOUNT' as const,
            ...(c.label ? { label: c.label } : {}),
            amount: Number(c.amount),
            currency: quotation.currency,
            isDeduction: c.isDeduction,
            sequence: index,
            isVisibleToCustomer: true,
          })),
        taxes: taxRows
          .filter((t) => t.ratePercent !== '')
          .map((t, index) => ({
            type: t.type as never,
            ratePercent: Number(t.ratePercent),
            // Both are recomputed by the service; sent because the DTO requires
            // them, and deliberately not collected from the user.
            taxableAmount: 0,
            amount: 0,
            currency: quotation.currency,
            ...(t.jurisdiction ? { jurisdiction: t.jurisdiction } : {}),
            isCompound: false,
            isReverseCharge: false,
            sequence: index,
          })),
      })
      setDirty(false)
      toast.success('Charges and taxes saved', 'The quotation has been re-totalled.')
      router.push(`/quotations/${id}`)
    } catch (error) {
      const described = describeApiError(error)
      toast.error(described.title, {
        ...(described.description ? { description: described.description } : {}),
        ...(described.requestId ? { requestId: described.requestId } : {}),
      })
    }
  }

  return (
    <>
      <PageHeader
        title="Charges and taxes"
        identifier={quotation.quotationNumber}
        description="Saved together, and the quotation is re-totalled once. Removing every row clears that side."
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href={`/quotations/${id}`}>Cancel</Link>
            </Button>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={frozen}
              onClick={() => void onSave()}
            >
              Save
            </Button>
          </>
        }
      />

      <div className="p-gutter">
        <div className="mx-auto grid max-w-4xl gap-gutter">
          {frozen ? (
            <Alert tone="danger" title="Pricing is frozen">
              This quotation is {humanise(quotation.status).toLowerCase()}. Create a revision to
              change its pricing.
            </Alert>
          ) : null}

          {dirty && !save.isPending ? (
            <p className="text-xs text-content-subtle" role="status">
              Unsaved changes. Leaving this page will discard them.
            </p>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle as="h2">Charges and discounts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-gap-lg">
              {chargeRows.length === 0 ? (
                <p className="text-xs text-content-muted">
                  No charges. Saving now clears any that were set.
                </p>
              ) : null}

              {chargeRows.map((row, index) => (
                <div
                  key={row.key}
                  className="grid gap-gap-lg rounded-md border border-line p-gap-lg sm:grid-cols-12"
                >
                  <div className="sm:col-span-3">
                    <Label htmlFor={`charge-type-${row.key}`}>Type</Label>
                    <Select
                      value={row.type}
                      onValueChange={(value) =>
                        mutate(
                          setCharges,
                          chargeRows.map((c, i) => (i === index ? { ...c, type: value } : c)),
                        )
                      }
                    >
                      <SelectTrigger id={`charge-type-${row.key}`} className="mt-gap-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHARGE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {humanise(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="sm:col-span-4">
                    <Label htmlFor={`charge-label-${row.key}`}>Label</Label>
                    <Input
                      id={`charge-label-${row.key}`}
                      className="mt-gap-xs"
                      value={row.label}
                      placeholder="Ocean freight"
                      onChange={(e) =>
                        mutate(
                          setCharges,
                          chargeRows.map((c, i) =>
                            i === index ? { ...c, label: e.target.value } : c,
                          ),
                        )
                      }
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <Label htmlFor={`charge-amount-${row.key}`} required>
                      Amount ({quotation.currency})
                    </Label>
                    <Input
                      id={`charge-amount-${row.key}`}
                      className="mt-gap-xs"
                      type="number"
                      step="any"
                      min="0"
                      value={row.amount}
                      onChange={(e) =>
                        mutate(
                          setCharges,
                          chargeRows.map((c, i) =>
                            i === index ? { ...c, amount: e.target.value } : c,
                          ),
                        )
                      }
                    />
                  </div>

                  <div className="flex items-end gap-gap sm:col-span-2">
                    <label className="flex items-center gap-gap text-xs text-content-muted">
                      <input
                        type="checkbox"
                        className="focus-ring"
                        checked={row.isDeduction}
                        onChange={(e) =>
                          mutate(
                            setCharges,
                            chargeRows.map((c, i) =>
                              i === index ? { ...c, isDeduction: e.target.checked } : c,
                            ),
                          )
                        }
                      />
                      Deduct
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove charge ${index + 1}`}
                      onClick={() =>
                        mutate(
                          setCharges,
                          chargeRows.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="secondary"
                size="sm"
                leadingIcon={<Plus />}
                onClick={() =>
                  mutate(setCharges, [
                    ...chargeRows,
                    {
                      key: newKey(),
                      type: CHARGE_TYPES[0]!,
                      label: '',
                      amount: '',
                      isDeduction: false,
                    },
                  ])
                }
              >
                Add charge
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Taxes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-gap-lg">
              <Alert tone="info" title="Amounts are computed, not entered">
                Each rate is applied to the taxable base by the server when you save. That is why
                there is no amount field here.
              </Alert>

              {taxRows.map((row, index) => (
                <div
                  key={row.key}
                  className="grid gap-gap-lg rounded-md border border-line p-gap-lg sm:grid-cols-12"
                >
                  <div className="sm:col-span-4">
                    <Label htmlFor={`tax-type-${row.key}`}>Type</Label>
                    <Select
                      value={row.type}
                      onValueChange={(value) =>
                        mutate(
                          setTaxes,
                          taxRows.map((t, i) => (i === index ? { ...t, type: value } : t)),
                        )
                      }
                    >
                      <SelectTrigger id={`tax-type-${row.key}`} className="mt-gap-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TAX_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {humanise(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="sm:col-span-3">
                    <Label htmlFor={`tax-rate-${row.key}`} required>
                      Rate %
                    </Label>
                    <Input
                      id={`tax-rate-${row.key}`}
                      className="mt-gap-xs"
                      type="number"
                      step="any"
                      min="0"
                      value={row.ratePercent}
                      onChange={(e) =>
                        mutate(
                          setTaxes,
                          taxRows.map((t, i) =>
                            i === index ? { ...t, ratePercent: e.target.value } : t,
                          ),
                        )
                      }
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <Label htmlFor={`tax-jur-${row.key}`}>Jurisdiction</Label>
                    <Input
                      id={`tax-jur-${row.key}`}
                      className="mt-gap-xs"
                      value={row.jurisdiction}
                      placeholder="India"
                      onChange={(e) =>
                        mutate(
                          setTaxes,
                          taxRows.map((t, i) =>
                            i === index ? { ...t, jurisdiction: e.target.value } : t,
                          ),
                        )
                      }
                    />
                  </div>

                  <div className="flex items-end sm:col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove tax ${index + 1}`}
                      onClick={() =>
                        mutate(
                          setTaxes,
                          taxRows.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="secondary"
                size="sm"
                leadingIcon={<Plus />}
                onClick={() =>
                  mutate(setTaxes, [
                    ...taxRows,
                    { key: newKey(), type: TAX_TYPES[0]!, ratePercent: '', jurisdiction: '' },
                  ])
                }
              >
                Add tax
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
