/** A rendered message, ready to hand to a transport. */
export interface EmailMessage {
  to: string[]
  subject: string
  html: string
  text: string
  /** Set when replies should reach a human rather than the sending address. */
  replyTo?: string
}

/** Outcome of one delivery attempt sequence. Never thrown - always returned. */
export type SendResult =
  | { status: 'sent'; id: string; attempts: number }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string; attempts: number; retryable: boolean }

/**
 * The port. A transport delivers a message or reports why it could not; it
 * does not decide whether the message should have been sent.
 */
export interface EmailTransport {
  send(message: EmailMessage): Promise<SendResult>
  /** Named for logs, so a delivery line says which transport produced it. */
  readonly name: string
}

/** Structured logger, matching the shape @triyara/lib's logger already has. */
export interface EmailLogger {
  info(obj: Record<string, unknown>, msg: string): void
  warn(obj: Record<string, unknown>, msg: string): void
  error(obj: Record<string, unknown>, msg: string): void
}
