/**
 * Refuses to run the registration suite against anything but an E2E database.
 *
 * These tests complete the public wizards for real, so every submitting test
 * leaves a row behind. Until this existed, a developer running `pnpm test:e2e`
 * with their usual `DATABASE_URL` - or with a dev server already up on :3000
 * reading `apps/web/.env.local` - would write "UI Audit Test Buyer" records
 * into the database they work in every day. Nothing failed; the rows simply
 * appeared in the wrong place.
 *
 * The rule is deliberately a name check rather than a list of forbidden
 * databases. A deny-list only stops the databases somebody thought of, and the
 * one that matters is always the one nobody thought of. Requiring the name to
 * say `e2e` means a new database is unsafe until it is named for the job.
 */

/** Databases these tests may write to must say so in their name. */
const E2E_NAME = /e2e/i

/**
 * The database part of a Postgres URL.
 *
 * Parsed with `URL` rather than a regular expression so a password containing
 * `/` or `@` cannot shift the boundaries and make the wrong name look right.
 * Nothing from the credentials is read, and nothing is logged.
 */
export function databaseNameFrom(connectionString: string): string | null {
  try {
    const name = new URL(connectionString).pathname.replace(/^\//, '')
    return name || null
  } catch {
    return null
  }
}

export function isApprovedE2EDatabase(connectionString: string): boolean {
  const name = databaseNameFrom(connectionString)
  return name !== null && E2E_NAME.test(name)
}

/**
 * Fails the run before Playwright starts a browser or a server.
 *
 * Called from `globalSetup`, so an unsafe target stops everything up front
 * rather than at the first submitting test - by which point a server is already
 * running and pointed at the wrong database.
 */
export function assertE2EDatabase(connectionString: string | undefined): void {
  // No DATABASE_URL is not an error here. Every spec skips itself in that case,
  // which is the existing convention and lets someone run the suite for a quick
  // look without standing a database up.
  if (!connectionString) return

  if (isApprovedE2EDatabase(connectionString)) return

  const name = databaseNameFrom(connectionString) ?? '<unparseable>'
  throw new Error(
    [
      `Refusing to run the registration end-to-end tests against the database "${name}".`,
      '',
      'These tests complete the public registration wizards for real, so each',
      'submitting test writes an Account or Supplier row. They must therefore run',
      'against a database kept for that purpose, and this one is not named like',
      'one - so it may well be the database you work in.',
      '',
      'Point DATABASE_URL at a database whose name contains "e2e", for example:',
      '',
      '  createdb triyara_e2e',
      '  DATABASE_URL=postgresql://…/triyara_e2e pnpm --filter @triyara/db db:deploy',
      '  DATABASE_URL=postgresql://…/triyara_e2e pnpm --filter @triyara/db db:seed',
      '  DATABASE_URL=postgresql://…/triyara_e2e pnpm test:e2e',
      '',
      'CI already does this; its database is triyara_e2e.',
    ].join('\n'),
  )
}
