import { Resend } from 'resend'

import {
  type AttemptOutcome,
  DEFAULT_RETRY,
  isRetryable,
  type RetryPolicy,
  withRetry,
} from './retry'
import type { EmailMessage, EmailTransport, SendResult } from './types'

export interface ResendTransportConfig {
  apiKey: string
  /** Verified sender, e.g. `TRIYARA <noreply@triyaraexports.com>`. */
  from: string
  retry?: RetryPolicy
}

/**
 * Anything the SDK reports. The shape is not fully typed across versions, so
 * the status code is read defensively rather than assumed.
 */
function statusOf(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    const candidate = (error as { statusCode?: unknown }).statusCode
    if (typeof candidate === 'number') return candidate
  }
  return undefined
}

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

export function createResendTransport(cfg: ResendTransportConfig): EmailTransport {
  const client = new Resend(cfg.apiKey)
  const policy = cfg.retry ?? DEFAULT_RETRY

  return {
    name: 'resend',
    async send(message: EmailMessage): Promise<SendResult> {
      const attempt = async (): Promise<AttemptOutcome<string>> => {
        try {
          const { data, error } = await client.emails.send({
            from: cfg.from,
            to: message.to,
            subject: message.subject,
            html: message.html,
            text: message.text,
            ...(message.replyTo ? { replyTo: message.replyTo } : {}),
          })

          if (error) {
            const status = statusOf(error)
            return { ok: false, error: messageOf(error), retryable: isRetryable(status, error) }
          }
          if (!data?.id) {
            // Accepted with no id: nothing to correlate a bounce against later,
            // so it is reported rather than quietly treated as success.
            return { ok: false, error: 'Resend returned no message id.', retryable: false }
          }
          return { ok: true, value: data.id, retryable: false }
        } catch (err) {
          // Thrown rather than returned: network, DNS, abort. Transient.
          return { ok: false, error: messageOf(err), retryable: true }
        }
      }

      const { outcome, attempts } = await withRetry(attempt, policy)
      if (outcome.ok && outcome.value) {
        return { status: 'sent', id: outcome.value, attempts }
      }
      return {
        status: 'failed',
        error: outcome.error ?? 'unknown error',
        attempts,
        retryable: outcome.retryable,
      }
    },
  }
}
