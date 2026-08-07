// @vitest-environment node
import { ForbiddenError, logger, NotFoundError } from '@triyara/lib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fileUrl = vi.fn()
vi.mock('@/lib/document-service', () => ({ documentService: { fileUrl } }))
vi.mock('@/auth/context', () => ({
  requireAuth: () => Promise.resolve({ userId: 'u1', organizationId: 'org1' }),
  currentUser: () => Promise.resolve({ id: 'u1', organizationId: 'org1' }),
}))

const { GET } = await import('../[id]/download/route')

let written: Record<string, unknown>[] = []

beforeEach(() => {
  written = []
  fileUrl.mockReset()
  vi.spyOn(logger, 'error').mockImplementation(((payload: unknown) => {
    written.push(payload as Record<string, unknown>)
  }) as never)
})

afterEach(() => vi.restoreAllMocks())

const call = () =>
  GET(new Request('https://portal.triyaraexports.com/api/v1/documents/doc1/download'), {
    params: Promise.resolve({ id: 'doc1' }),
  })

describe('a storage failure is not a missing document', () => {
  it('reports an outage as a server error and writes it down', async () => {
    // This is the defect: a bare `catch` answered 404 for everything, so a
    // supplier whose download failed was told the document did not exist, and
    // nothing anywhere recorded that storage was down.
    fileUrl.mockRejectedValue(
      Object.assign(new Error('Access Denied'), {
        $metadata: { httpStatusCode: 403, requestId: 'AWS-9', attempts: 3 },
      }),
    )

    const res = await call()

    expect(res.status).toBe(500)
    expect(written).toHaveLength(1)
    expect(written[0]!.source).toBe('storage')
    expect(written[0]!.storage).toMatchObject({ storageRequestId: 'AWS-9' })
  })

  it('still answers 404 for a document that genuinely is not there', async () => {
    fileUrl.mockRejectedValue(new NotFoundError('Document not found.'))

    const res = await call()

    expect(res.status).toBe(404)
    expect(written).toHaveLength(0)
  })

  it('still answers 404, not 403, for another tenant’s document', async () => {
    // The flattening is deliberate and must survive this change: a 403 here
    // would confirm the document exists to someone not entitled to know.
    fileUrl.mockRejectedValue(new ForbiddenError())

    const res = await call()

    expect(res.status).toBe(404)
    const body = (await res.json()) as { errors: { code: string }[] }
    expect(body.errors[0]!.code).toBe('NOT_FOUND')
  })

  it('does not leak the provider message to the caller', async () => {
    fileUrl.mockRejectedValue(new Error('Access Denied for arn:aws:iam::123456789012:user/prod'))

    const res = await call()
    const body = await res.text()

    expect(body).not.toContain('arn:aws:iam')
    // ...but the log keeps it, which is the whole point.
    expect(JSON.stringify(written)).toContain('arn:aws:iam')
  })
})
