'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, Badge, Button, Card, Textarea } from '@triyara/ui'
import { Check, X } from 'lucide-react'
import { useState } from 'react'

import { Can } from '@/lib/ability-context'
import { api } from '@/lib/api-client'

import { supplierKeys } from '../api/keys'
import type { Supplier } from '../types'

/**
 * Review controls for a supplier awaiting a decision (TRY-BNP-SUPPLIER-REG).
 *
 * Only the door was missing: `supplierMasterService.decide` already validates
 * the transition, and the repository already sets isVerified/verifiedAt when a
 * supplier reaches APPROVED. This panel calls that, nothing more.
 *
 * Shown only in PENDING_REVIEW, because those are the only states the machine
 * accepts a decision from — rendering the buttons anywhere else would offer an
 * action the API is right to refuse.
 */
export function SupplierReviewPanel({
  supplier,
  version,
}: {
  supplier: Supplier
  version: number
}) {
  const [comments, setComments] = useState('')
  const queryClient = useQueryClient()

  const decide = useMutation({
    mutationFn: async (decision: 'APPROVED' | 'REJECTED') => {
      // `version` rides in options, not as a positional argument: on this
      // client only patch and delete take it positionally, and the approval
      // endpoint is a POST that still requires If-Match.
      const result = await api.post<Supplier>(
        `/api/suppliers/${supplier.id}/approval`,
        { decision, ...(comments.trim() ? { comments: comments.trim() } : {}) },
        { version },
      )
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierKeys.detail(supplier.id) })
      void queryClient.invalidateQueries({ queryKey: supplierKeys.all })
    },
  })

  if (supplier.status !== 'PENDING_REVIEW') return null

  return (
    <Can action="manage" subject="SupplierProfile">
      <Card className="max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-gap">
          <div>
            <h3 className="text-base font-medium text-content">Awaiting review</h3>
            <p className="text-xs text-content-muted">
              {supplier.isSelfRegistered
                ? 'Submitted by the supplier. Nothing here has been checked by us.'
                : 'Submitted for approval.'}
            </p>
          </div>
          {supplier.isSelfRegistered ? (
            <Badge tone="warning" size="sm" dot>
              Self-registered
            </Badge>
          ) : null}
        </div>

        <div className="mt-gutter space-y-gap">
          <label htmlFor="review-comments" className="block text-xs font-medium text-content">
            Comments
          </label>
          <Textarea
            id="review-comments"
            rows={3}
            value={comments}
            maxLength={2000}
            placeholder="Why this decision? Recorded in the approval history."
            onChange={(event) => setComments(event.target.value)}
          />
        </div>

        {decide.isError ? (
          <div className="mt-gap">
            <Alert tone="danger" title="The decision was not recorded">
              <span role="alert">
                {decide.error instanceof Error
                  ? decide.error.message
                  : 'Something went wrong. Reload and try again.'}
              </span>
            </Alert>
          </div>
        ) : null}

        <div className="mt-gutter flex flex-wrap gap-gap">
          <Button
            variant="primary"
            leadingIcon={<Check />}
            loading={decide.isPending && decide.variables === 'APPROVED'}
            onClick={() => decide.mutate('APPROVED')}
          >
            Approve &amp; verify
          </Button>
          <Button
            variant="danger"
            leadingIcon={<X />}
            loading={decide.isPending && decide.variables === 'REJECTED'}
            onClick={() => decide.mutate('REJECTED')}
          >
            Reject
          </Button>
        </div>
      </Card>
    </Can>
  )
}
