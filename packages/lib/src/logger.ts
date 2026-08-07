import pino from 'pino'

// Structured JSON logging (TRY-BNP-DEV-01). Never log secrets or PII - redact here.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  // A safety net, not the guarantee. Callers construct their payloads from
  // named fields rather than spreading errors or requests, which is what
  // actually keeps a credential out of the log; this catches the shape nobody
  // anticipated. `cookie` and a bare `authorization` were both missing while
  // the app logged almost nothing - they matter now that errors carry request
  // context.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.authorization',
      'headers.cookie',
      'authorization',
      'cookie',
      'password',
      'passwordHash',
      'token',
      'tokenHash',
      'secret',
      'apiKey',
      'accessToken',
      'refreshToken',
      '*.authorization',
      '*.cookie',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.tokenHash',
      '*.secret',
      '*.apiKey',
      '*.accessToken',
      '*.refreshToken',
    ],
    censor: '[redacted]',
  },
  // No `transport`. pino runs a transport on a worker thread, and inside the
  // Next server that worker exits - after which every `logger.error` call
  // throws "the worker has exited" rather than writing anything. It went
  // unnoticed while almost nothing logged; the first error on a common path
  // turned every 500 in development into an uncaught exception and produced no
  // line at all. Plain JSON on stdout works in every runtime the app has, and
  // is what a log aggregator wants anyway. For readable local output, pipe:
  //   pnpm dev | pnpm exec pino-pretty
})

export type Logger = typeof logger
