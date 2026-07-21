import pino from 'pino'

// Structured JSON logging (TRY-BNP-DEV-01). Never log secrets or PII - redact here.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: ['req.headers.authorization', 'password', 'token', '*.password', '*.token'],
    censor: '[redacted]',
  },
  ...(process.env.NODE_ENV !== 'production'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
})

export type Logger = typeof logger
