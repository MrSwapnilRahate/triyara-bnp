import type { EmailLogger, EmailMessage, EmailTransport, SendResult } from './types'

/**
 * Development transport: writes the message to the log instead of sending it.
 *
 * This is what makes local work possible without a Resend key, and it is why
 * the password-reset link is still reachable in development. It is refused in
 * production by the factory - a silent no-op there would mean a supplier never
 * hears back and nobody finds out.
 */
export function createLogTransport(logger: EmailLogger): EmailTransport {
  let counter = 0
  return {
    name: 'log',
    send(message: EmailMessage): Promise<SendResult> {
      counter += 1
      const id = `log_${counter}`
      logger.info(
        { to: message.to, subject: message.subject, id, body: message.text },
        'email.not_sent_development',
      )
      return Promise.resolve({ status: 'sent', id, attempts: 1 })
    },
  }
}
