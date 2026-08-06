'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Input, Label, PageHeader, Skeleton, useToast } from '@triyara/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

import { InlineQueryError } from '@/components/data/query-boundary'
import { useAbility } from '@/lib/ability-context'
import { ApiError } from '@/lib/api-client'
import { describeApiError } from '@/lib/api-error'

import { useQuotation, useReplaceItems, useReviseQuotation } from '../api/quotations'
import { formatMoney, isEditable } from '../types'
import { quotationLinesSchema } from './line-schema'
import { QuotationLinesField } from './quotation-lines-field'
import { useDirtyGuard } from './use-dirty-guard'

type LinesInput = z.input<typeof quotationLinesSchema>
type LinesOutput = z.output<typeof quotationLinesSchema>

/**
 * Edit the priced lines (§9).
 *
 * Two modes on one screen, because they are the same form over the same data
 * and differ only in where the result lands:
 *
 *   `mode="replace"` - the quotation is still editable, so the lines are
 *   replaced in place and the totals are recomputed.
 *
 *   `mode="revise"`  - the quotation is frozen, so saving creates a SUCCESSOR
 *   under the same number and supersedes this one. That needs a reason, and it
 *   navigates to a different record afterwards.
 *
 * Presenting them separately would invite the question "why can't I just edit
 * it", which the frozen-state explanation answers better in context.
 */
export function QuotationLinesEditor({ id, mode }: { id: string; mode: 'replace' | 'revise' }) {
  const router = useRouter()
  const toast = useToast()
  const ability = useAbility()
  const query = useQuotation(id)
  const replace = useReplaceItems(id)
  const revise = useReviseQuotation(id)

  const showCost = ability.can('manage', 'Account')

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<LinesInput, unknown, LinesOutput>({
    resolver: zodResolver(quotationLinesSchema),
    values: {
      // Decimal arrives as a string; the schema's input side is a number.
      items: (query.data?.quotation.items ?? []).map((item) => ({
        customProductName: item.product?.name ?? item.customProductName ?? '',
        quantity: Number(item.quantity),
        unit: item.unit,
        unitPrice: Number(item.unitPrice),
        // The API types this as string[]; the form schema narrows it to the
        // certification enum. Cast at the boundary rather than widening the
        // schema, so a bad code still fails validation on submit.
        requiredCertifications:
          item.requiredCertifications as LinesInput['items'][number]['requiredCertifications'],
        ...(item.unitCost !== null ? { unitCost: Number(item.unitCost) } : {}),
        ...(item.packaging !== null ? { packaging: item.packaging } : {}),
        ...(item.hsCode !== null ? { hsCode: item.hsCode } : {}),
      })),
    },
  })

  const reasonField = useForm<{ reason: string }>({ defaultValues: { reason: '' } })

  useDirtyGuard(isDirty && !isSubmitting)

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
  const editable = isEditable(quotation.status)
  // The route and the document have to agree, or the save will fail for a
  // reason the user cannot see.
  const mismatch =
    (mode === 'replace' && !editable) ||
    (mode === 'revise' && (editable || Boolean(quotation.supersededAt)))

  async function onSubmit(values: LinesOutput) {
    try {
      if (mode === 'revise') {
        const reason = reasonField.getValues('reason').trim()
        if (reason.length === 0) {
          reasonField.setError('reason', { type: 'required', message: 'A reason is required.' })
          return
        }
        const successor = await revise.mutateAsync({ reason, items: values.items, version })
        toast.success(
          `Revision ${successor.revisionNumber} created`,
          'This quotation has been superseded.',
        )
        router.push(`/quotations/${successor.id}`)
      } else {
        const result = await replace.mutateAsync({ items: values.items, version })
        toast.success(
          'Lines saved',
          `New total ${formatMoney(String(result.meta.grandTotal ?? ''), quotation.currency)}.`,
        )
        router.push(`/quotations/${id}`)
      }
    } catch (error) {
      if (error instanceof ApiError) {
        for (const fieldError of error.fieldErrors) {
          setError(fieldError.field as keyof LinesInput, {
            type: 'server',
            message: fieldError.message,
          })
        }
        if (error.fieldErrors.length > 0) return
      }
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
        title={mode === 'revise' ? 'Revise quotation' : 'Edit lines'}
        identifier={`${quotation.quotationNumber} · rev ${quotation.revisionNumber}`}
        description={
          mode === 'revise'
            ? `Saving creates revision ${quotation.revisionNumber + 1} under the same number and supersedes this one. This document is kept.`
            : 'Every line is replaced and the totals are recomputed by the server.'
        }
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href={`/quotations/${id}`}>Cancel</Link>
            </Button>
            <Button
              type="submit"
              form="quotation-lines-form"
              variant="primary"
              loading={isSubmitting}
              disabled={mismatch}
            >
              {mode === 'revise' ? 'Create revision' : 'Save lines'}
            </Button>
          </>
        }
      />

      <form id="quotation-lines-form" onSubmit={handleSubmit(onSubmit)} className="p-gutter">
        <div className="mx-auto grid max-w-5xl gap-gutter">
          {mismatch ? (
            <Alert
              tone="danger"
              title={
                mode === 'revise'
                  ? 'This quotation cannot be revised'
                  : 'These lines can no longer be edited'
              }
            >
              {mode === 'revise'
                ? quotation.supersededAt
                  ? 'It has already been superseded by a later revision.'
                  : 'It is still editable, so change the lines directly instead of revising.'
                : `It is ${quotation.status.toLowerCase().replace(/_/g, ' ')}. Create a revision instead.`}
            </Alert>
          ) : null}

          {Object.keys(errors).length > 0 ? (
            <Alert tone="danger" title="Check the highlighted lines" />
          ) : null}

          {isDirty && !isSubmitting ? (
            <p className="text-xs text-content-subtle" role="status">
              Unsaved changes. Leaving this page will discard them.
            </p>
          ) : null}

          {mode === 'revise' ? (
            <div>
              <Label htmlFor="reason" required>
                Reason for the revision
              </Label>
              <Input
                id="reason"
                className="mt-gap-xs max-w-xl"
                placeholder="Buyer renegotiated freight."
                invalid={Boolean(reasonField.formState.errors.reason)}
                {...reasonField.register('reason')}
              />
              {reasonField.formState.errors.reason ? (
                <p className="mt-gap-xs text-xs text-danger" role="alert">
                  {reasonField.formState.errors.reason.message}
                </p>
              ) : (
                <p className="mt-gap-xs text-xs text-content-subtle">
                  Recorded against the revision so an auditor can see why the price changed.
                </p>
              )}
            </div>
          ) : null}

          <QuotationLinesField
            control={control}
            register={register}
            errors={errors}
            showCost={showCost}
            currency={quotation.currency}
            title={mode === 'revise' ? `Revision ${quotation.revisionNumber + 1} lines` : 'Lines'}
          />
        </div>
      </form>
    </>
  )
}
