import { createEnv } from '@triyara/lib'
import { z } from 'zod'

// Server-only. Validated once at boot; never import into a client component.
export const env = createEnv({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
})
