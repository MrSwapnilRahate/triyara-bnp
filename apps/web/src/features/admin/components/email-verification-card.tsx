'use client'

import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@triyara/ui'
import { MailCheck } from 'lucide-react'
import { useEffect, useState } from 'react'

import { InlineQueryError } from '@/components/data/query-boundary'
import { describeApiError } from '@/lib/api-error'

import { useEmailVerificationStatus, useRequestEmailVerification } from '../api/admin'

/**
 * Whether this address has been proved, and how to prove it.
 *
 * The backend has issued, hashed, expired and consumed verification tokens
 * since it was written, and no screen ever showed the result - so a user could
 * neither see that they were unverified nor do anything about it. This is that
 * screen.
 *
 * It is its own card, outside the profile form, for the same reason the
 * password form is: it is a separate request with separate semantics, and
 * pressing "Save changes" should not send anybody an email.
 *
 * Two things it deliberately does NOT do:
 *
 *   - offer a target. The route accepts `?userId=`, and the service demands
 *     `update User` for it. This screen is "my profile", so the hook it calls
 *     takes no argument at all; there is no control here that could name
 *     somebody else, and no administrator button, because verifying your own
 *     address is not an administrative act.
 *   - show or hold the token. The token is issued into the email and nowhere
 *     else - not this component's state, not the response body it reads.
 */
const RESEND_COOLDOWN_SECONDS = 60

export function EmailVerificationCard({ email }: { email: string }) {
  const status = useEmailVerificationStatus()
  const request = useRequestEmailVerification()
  const [cooldown, setCooldown] = useState(0)

  // Counts down after a send, so a second press is a decision rather than an
  // impatient double-click. The backend rate-limits writes regardless; this is
  // about telling the user the mail is already on its way.
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  if (status.isPending)
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h2">Email address</CardTitle>
        </CardHeader>
        <CardContent aria-busy="true">
          <Skeleton variant="text" className="h-5 w-64" />
        </CardContent>
      </Card>
    )

  if (status.isError)
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h2">Email address</CardTitle>
        </CardHeader>
        <CardContent>
          <InlineQueryError error={status.error} onRetry={() => void status.refetch()} />
        </CardContent>
      </Card>
    )

  const verified = status.data.verified
  const described = request.isError ? describeApiError(request.error) : null

  async function send() {
    try {
      await request.mutateAsync()
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch {
      // Rendered below rather than thrown away. The reason matters here: an
      // address verified in another tab comes back as a refusal, not a failure.
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Email address</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-gap-lg">
        <div className="flex flex-wrap items-center justify-between gap-gap">
          <span className="text-sm text-content">{email}</span>
          {verified ? (
            <Badge tone="success">Verified</Badge>
          ) : (
            <Badge tone="warning">Not verified</Badge>
          )}
        </div>

        {verified ? (
          <p className="text-xs text-content-subtle">
            {status.data.emailVerifiedAt
              ? `Verified on ${new Date(status.data.emailVerifiedAt).toLocaleDateString()}.`
              : 'This address has been confirmed.'}
          </p>
        ) : (
          <>
            <p className="text-xs text-content-subtle">
              We will email a link to this address. Opening it while signed in confirms the address
              is yours. The link expires, and works once.
            </p>

            {request.isSuccess ? (
              <Alert tone="success" title="Verification email sent">
                Check {email} and open the link. It may take a minute to arrive.
              </Alert>
            ) : null}

            {described ? (
              <Alert tone="danger" title={described.title}>
                {described.description ?? 'The verification email could not be sent.'}
              </Alert>
            ) : null}

            <div className="flex items-center gap-gap">
              <Button
                type="button"
                variant="primary"
                leadingIcon={<MailCheck />}
                loading={request.isPending}
                disabled={cooldown > 0}
                onClick={() => void send()}
              >
                {request.isSuccess ? 'Resend verification email' : 'Send verification email'}
              </Button>
              {cooldown > 0 ? (
                <span className="text-xs text-content-subtle" role="status">
                  You can resend in {cooldown}s
                </span>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
