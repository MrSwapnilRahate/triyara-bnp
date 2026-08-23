import { createEnv } from '@triyara/lib/env'
import { z } from 'zod'

// Server-only. Validated once at boot; never import into a client component.
//
// Imported from `@triyara/lib/env` rather than the package root. The root
// barrel re-exports `logger`, which calls `pino()` at module scope - a side
// effect, so it survives tree-shaking. Reaching this schema through the barrel
// would therefore drag pino into whatever imports it, and the intended caller
// is `instrumentation.ts`, which Next evaluates in the edge runtime too. The
// subpath resolves straight to the module and pulls in nothing but zod.
export const env = createEnv({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
})
