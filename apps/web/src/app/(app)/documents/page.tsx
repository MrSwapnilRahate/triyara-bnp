import { listDocumentsQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { accountService } from '@/lib/account-service'
import { documentService } from '@/lib/document-service'

import { DocumentsView } from './documents-view'

export const dynamic = 'force-dynamic'

type Search = Promise<Record<string, string | undefined>>

export default async function DocumentsPage({ searchParams }: { searchParams: Search }) {
  const auth = await requireAuth()
  const requestId = crypto.randomUUID()
  const sp = await searchParams

  const query = listDocumentsQuerySchema.parse({
    limit: 25,
    cursor: sp.cursor,
    q: sp.q,
    accountId: sp.accountId,
    type: sp.type,
    status: sp.status,
  })

  const [result, accounts] = await Promise.all([
    documentService.list({ ...auth, requestId }, query),
    accountService.list({ ...auth, requestId }, { limit: 100 }),
  ])

  const canWrite = auth.ability.can('create', 'Document')
  const canDelete = auth.ability.can('delete', 'Document')

  return (
    <DocumentsView
      items={result.items}
      nextCursor={result.nextCursor}
      accounts={accounts.items.map((a) => ({ id: a.id, legalName: a.legalName }))}
      canWrite={canWrite}
      canDelete={canDelete}
    />
  )
}
