export { createEmailTransportFromEnv } from './factory'
export { createLogTransport } from './log-transport'
export { createResendTransport, type ResendTransportConfig } from './resend'
export { DEFAULT_RETRY, isRetryable, type RetryPolicy, withRetry } from './retry'
export {
  createEmailService,
  type EmailService,
  type EmailServiceDeps,
  isSendableAddress,
  type Recipient,
} from './service'
export * as emailTemplates from './templates'
export type { EmailLogger, EmailMessage, EmailTransport, SendResult } from './types'
