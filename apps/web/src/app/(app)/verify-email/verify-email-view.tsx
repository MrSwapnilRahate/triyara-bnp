'use client'

import { Alert, Button, Card, CardContent, PageHeader, Skeleton } from '@triyara/ui'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { useConfirmEmailVerification, useEmailVerificationStatus } from '@/features/admin/api/admin'
import { ApiError } from '@/lib/api-client'
import { describeApiError } from '@/lib/api-error'

/**
 * Confirms the address from the emailed link.
 *
 * The token is taken from the query string and passed to the confirm endpoint.
 * It is never rendered, never logged, and never sent anywhere else - the only
 * outbound use of it in this file is the one mutation call.
 *
 * The API answers expired, already-used and never-existed identically, with a
 * single 404 and one message. That is deliberate on the server's part: a
 * distinct "already used" reply would confirm to a stranger that a token was
 * once real. So this screen does not pretend to tell them apart either. What it
 * can do honestly is check the reader's own standing - if their address is
 * already verified, a dead link is good news, not a failure, and it says so.
 */
export function VerifyEmailView() {
  const token = useSearchParams().get('token') ?? ''
  const confirm = useConfirmEmailVerification()
  const status = useEmailVerificationStatus()

  // Fires once per page. Without the guard, StrictMode's double-invoke would
  // spend the token on the first call and then report the second, failing call
  // as an invalid link - a success rendered as an error.
  const started = useRef(false)
  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    confirm.mutate(token)
  }, [token, confirm])

  return (
    <>
      <PageHeader title="Verify your email" />
      <div className="p-gutter">
        <Card className="mx-auto max-w-xl">
          <CardContent className="grid gap-gap-lg py-gutter">
            <Outcome token={token} confirm={confirm} verified={status.data?.verified ?? false} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function Outcome({
  token,
  confirm,
  verified,
}: {
  token: string
  confirm: ReturnType<typeof useConfirmEmailVerification>
  verified: boolean
}) {
  if (!token)
    return (
      <>
        <Alert tone="danger" title="This link is incomplete">
          The address in your browser is missing its verification code. Copying the link by hand
          usually drops part of it - open it from the email instead.
        </Alert>
        <BackToProfile label="Send a new verification email" />
      </>
    )

  if (confirm.isSuccess)
    return (
      <>
        <Alert tone="success" title="Your email address is verified">
          Thank you. Nothing else is needed.
        </Alert>
        <BackToProfile label="Back to my profile" />
      </>
    )

  if (confirm.isError) return <Failure error={confirm.error} verified={verified} />

  return (
    <div aria-busy="true" className="grid gap-gap" role="status">
      <p className="text-sm text-content-muted">Verifying your email address…</p>
      <Skeleton variant="text" className="h-5 w-64" />
    </div>
  )
}

function Failure({ error, verified }: { error: unknown; verified: boolean }) {
  const status = error instanceof ApiError ? error.status : 0

  // Already verified, and the link is spent. The common case: a second click,
  // or a second link after the first was used. Nothing is wrong.
  if (status === 404 && verified)
    return (
      <>
        <Alert tone="success" title="Your email address is already verified">
          This link has been used. There is nothing left to do.
        </Alert>
        <BackToProfile label="Back to my profile" />
      </>
    )

  if (status === 404)
    return (
      <>
        <Alert tone="warning" title="This link is no longer valid">
          Verification links expire and can only be used once, so this one has either been used
          already or has aged out. Requesting a new one takes a moment.
        </Alert>
        <BackToProfile label="Send a new verification email" />
      </>
    )

  if (status === 403)
    return (
      <>
        <Alert tone="danger" title="This link belongs to a different account">
          You are signed in as somebody else. Sign in as the account the email was addressed to,
          then open the link again.
        </Alert>
        <BackToProfile label="Back to my profile" />
      </>
    )

  const described = describeApiError(error)
  return (
    <>
      <Alert tone="danger" title={described.title}>
        {described.description ?? 'The address could not be verified. Please try again.'}
      </Alert>
      <BackToProfile label="Back to my profile" />
    </>
  )
}

/** Every outcome ends somewhere useful, and that somewhere is the one screen
 *  that can issue a fresh link. */
function BackToProfile({ label }: { label: string }) {
  return (
    <div>
      <Button asChild variant="secondary">
        <Link href="/settings/profile">{label}</Link>
      </Button>
    </div>
  )
}
