'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, PageHeader, Skeleton, useToast } from '@triyara/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

import { InlineQueryError } from '@/components/data/query-boundary'
import { ApiError } from '@/lib/api-client'
import { describeApiError } from '@/lib/api-error'

import { useReviseItems, useRfq } from '../api/rfqs'
import { LINES_FROZEN_IN } from '../types'
import { rfqLinesSchema } from './line-schema'
import { RfqItemsField } from './rfq-items-field'

type ReviseInput = z.input<typeof rfqLinesSchema>
type ReviseOutput = z.output<typeof rfqLinesSchema>

/**
 * Revise the lines (§9).
 *
 * This screen replaces every line at once and cuts a new revision - it is not
 * a per-line edit, because the API has no per-line PATCH and the domain does
 * not allow quietly amending a document suppliers have already quoted against.
 * The form is pre-filled with the current lines so "revise" still feels like
 * editing rather than retyping.
 */
export function RfqItemsEditor({ id }: { id: string }) {
  const router = useRouter()
  const toast = useToast()
  const query = useRfq(id)
  const revise = useReviseItems(id)

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ReviseInput, unknown, ReviseOutput>({
    resolver: zodResolver(rfqLinesSchema),
    values: {
      // The API sends Decimal as a string; the schema's input side is a number.
      items: (query.data?.rfq.items ?? []).map((item) => ({
        customProductName: item.product?.name ?? item.customProductName ?? '',
        quantity: Number(item.quantity),
        unit: item.unit,
        requiredCertifications:
          item.requiredCertifications as ReviseInput['items'][number]['requiredCertifications'],
        ...(item.targetPrice !== null ? { targetPrice: Number(item.targetPrice) } : {}),
      })),
    },
  })

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

  const { rfq, version } = query.data
  const frozen = LINES_FROZEN_IN.includes(rfq.status)

  async function onSubmit(values: ReviseOutput) {
    try {
      await revise.mutateAsync({ items: values.items, version })
      toast.success('Lines revised', `This is now revision ${rfq.currentRevision + 1}.`)
      router.push(`/rfqs/${id}`)
    } catch (error) {
      if (error instanceof ApiError) {
        for (const fieldError of error.fieldErrors) {
          setError(fieldError.field as keyof ReviseInput, {
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
        title="Revise lines"
        identifier={rfq.rfqNumber}
        description={`Replacing the lines cuts revision ${rfq.currentRevision + 1}. The previous revision is kept.`}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href={`/rfqs/${id}`}>Cancel</Link>
            </Button>
            <Button
              type="submit"
              form="rfq-items-form"
              variant="primary"
              loading={isSubmitting}
              disabled={frozen}
            >
              Save revision
            </Button>
          </>
        }
      />

      <form id="rfq-items-form" onSubmit={handleSubmit(onSubmit)} className="p-gutter">
        <div className="mx-auto grid max-w-4xl gap-gutter">
          {frozen ? (
            <Alert tone="danger" title="Lines can no longer be revised">
              This RFQ is {rfq.status.toLowerCase()}. Its lines are part of the settled record.
            </Alert>
          ) : null}

          {Object.keys(errors).length > 0 ? (
            <Alert tone="danger" title="Check the highlighted lines" />
          ) : null}

          <RfqItemsField
            control={control}
            register={register}
            errors={errors}
            title={`Revision ${rfq.currentRevision + 1}`}
            description="Every line is replaced. Remove what no longer applies and add what does."
          />
        </div>
      </form>
    </>
  )
}
