import { defineConfig, devices } from '@playwright/test'

/**
 * Browser-level coverage for the flows a stranger uses before they have an
 * account.
 *
 * The config lives beside the suite rather than at the repository root, and that
 * is not a preference. Playwright reads the nearest `tsconfig.json` when it
 * loads this file; at the root that is the solution-style config whose
 * `references` include `apps/web`, which sets `composite: false`. A project
 * reference must be composite, so Playwright refused to load its own config and
 * `pnpm test:e2e` could not start at all - which is why these tests had never
 * run anywhere. Sitting next to `e2e/tsconfig.json` fixes that inside the test
 * setup, without changing how the application builds or typechecks.
 */
export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Refuses an unsafe database before a server or a browser is started. See
  // support/database-guard.ts - these tests write real registration rows.
  globalSetup: './support/global-setup.ts',
  // Written to the repository root, which is the path CI uploads on failure.
  // Without a reporter that produces one, that upload found nothing and every
  // CI failure had to be debugged from the log alone.
  reporter: [['list'], ['html', { outputFolder: '../playwright-report', open: 'never' }]],
  use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' },
  webServer: {
    // A production build, not `next dev`. The application sends its own
    // Content-Security-Policy with `script-src 'self' 'unsafe-inline'`, and the
    // dev server evaluates strings for hot reload - so under `next dev` the CSP
    // blocks React from hydrating and every interaction in these wizards fails.
    // Building first is also the honest thing to test: it is the bundle real
    // visitors receive.
    command: 'pnpm --filter @triyara/web build && pnpm --filter @triyara/web start',
    // Relative paths resolve against this file, which is no longer the
    // repository root - so the workspace root is named explicitly.
    cwd: '..',
    url: 'http://localhost:3000',
    env: {
      // Passed through explicitly. Playwright REPLACES the child environment
      // with this object rather than merging into it, so naming any variable
      // here drops DATABASE_URL - which the server then fails to connect with,
      // while locally looking fine because `.env.local` quietly supplies one.
      ...(process.env as Record<string, string>),
      // `next start` sets NODE_ENV=production, and in production the email
      // factory refuses to fall back to its log transport - a deliberate rule,
      // since a registration confirmation that silently never arrives is
      // indistinguishable from never having registered. It therefore throws at
      // construction, and the registration route answers 500.
      //
      // These are obvious non-credentials for an unroutable domain. The
      // transport constructs, the send fails, and the event bus swallows that
      // failure exactly as it is built to - so the row is still written and the
      // flow under test is the real one.
      // Pinned to the port this server actually listens on. Auth.js builds its
      // post-login redirect from this, and a developer's .env.local naming a
      // different port (3100, say) is inherited straight through - so the
      // browser is sent somewhere nothing is listening and login fails with a
      // connection refused that looks nothing like an auth problem.
      NEXTAUTH_URL: 'http://localhost:3000',
      AUTH_URL: 'http://localhost:3000',
      RESEND_API_KEY: 'e2e-not-a-real-key',
      EMAIL_FROM: 'e2e@triyara.invalid',
      // Real object storage, on this machine.
      //
      // These four used to be deliberately fake, on the reasoning that nothing
      // would ever call them. Two specs did. Presigning is an offline
      // signature, so it succeeded and handed the browser a URL at a bucket
      // that does not exist; the PUT then failed at the network layer with
      // "Failed to fetch", `documentService.create` found nothing to stat, and
      // no document row was ever written. That took out the documents journey
      // and the verification one behind it, which needs a document to accept.
      //
      // MinIO speaks the S3 API, so the application keeps its own storage
      // architecture exactly: the same `s3` provider, the same presigned PUT
      // from the browser, a real object, and a real `stat` that reads back the
      // size and checksum the metadata row records. Nothing is mocked and the
      // production guard in `createStorageFromEnv` is untouched - `s3` is a
      // provider it already accepts anywhere.
      //
      // `STORAGE_ENDPOINT` also turns on path-style addressing in the SDK
      // (`forcePathStyle` defaults to whether an endpoint is set), which is
      // what MinIO serves, and `next.config.mjs` derives the CSP `connect-src`
      // origin from it - so the browser is allowed to reach it at all. That
      // policy is baked at build time, which is why these belong in the env
      // shared by the build and the run rather than only the run.
      //
      // Credentials for a container that exists for the length of a test run
      // and listens on localhost. See docker-compose.yml.
      STORAGE_PROVIDER: 's3',
      STORAGE_ENDPOINT: 'http://localhost:9000',
      STORAGE_BUCKET: 'triyara-e2e',
      STORAGE_ACCESS_KEY_ID: 'e2eminio',
      STORAGE_SECRET_ACCESS_KEY: 'e2eminio123',
      STORAGE_REGION: 'us-east-1',
    },
    // Never reused, not even locally. A server already on :3000 is almost
    // certainly a development one reading apps/web/.env.local, and reusing it
    // would run these tests - which submit real registrations - against
    // whatever database that server happens to hold open, silently defeating
    // the guard above. Paying for a build is the cheaper mistake.
    reuseExistingServer: false,
    // A cold Next build is slow; the default two minutes is not enough.
    timeout: 300_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // The phone smoke tests belong to the mobile project; running them here
      // as well would assert a small-screen layout on a desktop viewport. The
      // suffix is the convention rather than a list of filenames, so a new
      // phone spec joins the right project by being named like one.
      testIgnore: /-mobile\.spec\.ts/,
    },
    // A phone, and deliberately scoped to the specs written for one. The
    // public wizards and the buyer portal are both read on phones - a buyer
    // reaching the portal is usually following a link we emailed them - while
    // the signed-in STAFF journeys are desktop work, and running those twice
    // would double the suite for no signal.
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
      testMatch: /-mobile\.spec\.ts/,
    },
  ],
})
