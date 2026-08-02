'use client'

import { useMutation } from '@tanstack/react-query'
import { Alert, Badge, Button, Card, Textarea } from '@triyara/ui'
import { Check, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Can } from '@/lib/ability-context'
import { api } from '@/lib/api-client'

export interface BuyerReviewSubject {
  id: string
  registrationStatus: string
  isSelfRegistered: boolean
  version: number
}

/**
 * Review controls for an account awaiting a decision (TRY-BNP-BUYER-REG).
 *
 * The mirror of SupplierReviewPanel, calling the same shape of endpoint against
 * the same shared transition guard. Shown only in PENDING_REVIEW, because that
 * is the only state the machine accepts a decision from — rendering the buttons
 * anywhere else would offer an action the API is right to refuse.
 *
 * Approving sets `isVerified` in the same transaction: "convert into a verified
 * buyer" is one decision, not a second thing someone has to remember.
 */
export function BuyerReviewPanel({ account }: { account: BuyerReviewSubject }) {
  const [comments, setComments] = useState('')
  const router = useRouter()

  const decide = useMutation({
    mutationFn: async (decision: 'APPROVED' | 'REJECTED') => {
      const result = await api.post<{ id: string; registrationStatus: string }>(
        `/api/v1/accounts/${account.id}/approval`,
        { decision, ...(comments.trim() ? { comments: comments.trim() } : {}) },
        { version: account.version },
      )
      return result.data
    },
    // The surrounding screen is server-rendered and driven by server actions,
    // so a refresh is what makes the new status visible rather than a cache
    // invalidation this page never reads.
    onSuccess: () => router.refresh(),
  })

  if (account.registrationStatus !== 'PENDING_REVIEW') return null

  return (
    <Can action="manage" subject="Account">
      <Card className="max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-gap">
          <div>
            <h3 className="text-base font-medium text-content">Awaiting review</h3>
            <p className="text-xs text-content-muted">
              {account.isSelfRegistered
                ? 'Submitted by the buyer. Nothing here has been checked by us.'
                : 'Submitted for approval.'}
            </p>
          </div>
          {account.isSelfRegistered ? (
            <Badge tone="warning" size="sm" dot>
              Self-registered
            </Badge>
          ) : null}
        </div>

        <div className="mt-gutter space-y-gap">
          <label htmlFor="buyer-review-comments" className="block text-xs font-medium text-content">
            Comments
          </label>
          <Textarea
            id="buyer-review-comments"
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
