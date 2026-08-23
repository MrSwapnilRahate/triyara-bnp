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
// Only variables the app cannot run without belong here, and only ones that are
// already configured everywhere this schema executes - local, CI, preview and
// production. `register()` is skipped during `next build` (Next 15.5 checks
// NEXT_PHASE in both the Node and edge paths), so nothing here can fail a build;
// it can only fail a server that is about to serve traffic.
//
// Anything provider-conditional stays out. Storage and email already validate
// their own credentials against the provider actually selected, which a flat
// schema here cannot express - and those variables are absent from preview and
// CI, so requiring them would break both.
export const env = createEnv({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Read by Prisma from the datasource block, not through process.env, so
  // nothing in the app would report it missing until the first query.
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),

  // Read implicitly by Auth.js; it appears nowhere in apps/web/src/auth. Without
  // it every session silently fails to verify.
  //
  // No minimum length beyond "set". Neither Auth.js nor this repository
  // establishes one, and CI signs in with a short placeholder - a floor invented
  // here would reject a working value.
  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET is required.'),
})
