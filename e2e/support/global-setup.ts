import { assertE2EDatabase } from './database-guard'

/**
 * Runs once, before Playwright starts the web server or any browser.
 *
 * The database check belongs here rather than in a `beforeEach`: by the time a
 * test body runs, the server is already up and connected, and a guard that
 * fires then has let the thing it guards against already happen.
 */
export default function globalSetup(): void {
  assertE2EDatabase(process.env.DATABASE_URL)
}
