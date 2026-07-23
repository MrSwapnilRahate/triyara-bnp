import { reviewerRepository } from '@triyara/db'

import { requireAuth } from '@/auth/context'
import { accountService } from '@/lib/account-service'
import { documentService } from '@/lib/document-service'
import { verificationService } from '@/lib/verification-service'

import { VerificationDetail } from './detail-view'

export const dynamic = 'force-dynamic'

export default async function VerificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const auth = await requireAuth()
  const { id } = await params
  const requestId = crypto.randomUUID()
  const ctx = { ...auth, requestId }

  const verification = await verificationService.get(ctx, id)
  const [account, docs, history, reviewers] = await Promise.all([
    accountService.get(ctx, verification.accountId, { includeDeleted: true }),
    documentService.list(ctx, { limit: 100, accountId: verification.accountId }),
    verificationService.history(ctx, id),
    reviewerRepository.listReviewers(auth.organizationId),
  ])

  return (
    <VerificationDetail
      verification={verification}
      accountName={account.legalName}
      documents={docs.items.map((d) => ({
        id: d.id,
        title: d.title,
        type: d.type,
        status: d.status,
        expiryDate: d.expiryDate,
      }))}
      history={history}
      reviewers={reviewers}
      canVerify={auth.ability.can('verify', 'Verification')}
      canUpdate={auth.ability.can('update', 'Verification')}
      canNote={auth.ability.can('create', 'Note')}
    />
  )
}
