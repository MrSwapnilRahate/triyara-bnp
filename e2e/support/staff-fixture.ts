import { randomUUID } from 'node:crypto'

import type { Page } from '@playwright/test'

import { bootstrapAdmin } from '../../packages/db/src/bootstrap-admin'
import { prisma } from '../../packages/db/src/client'

/**
 * One administrator per spec, rather than one administrator for the suite.
 *
 * Every staff-facing spec used to sign in as the seeded `admin@triyaraexports.com`
 * with the password published in the seed. That is one identity shared by eight
 * specs running in parallel, and the application quite correctly refuses it:
 * `authorize()` rate-limits login to five attempts per fifteen minutes per email
 * address, so the sixth spec to reach the form was told "Invalid email or
 * password" and sat at `/login` until the test timed out.
 *
 * The arithmetic was exact - eight specs, five allowed, three failures every
 * run - and which three lost was a race, which is why the failing set rotated
 * between runs and looked like flakiness rather than contention.
 *
 * The fix is not to raise the limit, which exists to make brute force
 * expensive, nor to run the suite one worker at a time, which would trade
 * minutes of everybody's day for a problem the tests created themselves. It is
 * to stop pretending eight concurrent workers are one person: each spec brings
 * its own administrator, so no address is ever attempted twice and the limiter
 * never has an opinion about any of it.
 *
 * `bootstrapAdmin` is the repository's own out-of-band way to create the first
 * administrator - the same primitive an operator runs against a fresh
 * deployment. Using it here rather than inserting rows means the role
 * catalogue, the ADMIN grant and the password hashing all happen exactly as
 * they do in production, and no test needs to know how any of that works.
 */

/** Matches the seed, which is the only organization these tests use. */
const ORGANIZATION_SLUG = 'triyara'

export interface StaffAdmin {
  readonly email: string
  /** Chosen here, satisfying the same rule the change-password form applies. */
  readonly password: string
  readonly name: string
}

/**
 * Creates one administrator, for one spec.
 *
 * `label` names the spec so a row found later says which test made it. The
 * stamp is what actually keeps two workers apart, and it is per call rather
 * than per file: two tests in one spec still get two identities.
 */
export async function createStaffAdmin(label: string): Promise<StaffAdmin> {
  const stamp = `${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`
  const email = `e2e-staff-${label}-${stamp}@example.com`.toLowerCase()

  // Twelve characters with an upper, a lower and a digit, because
  // `parseBootstrapConfig` enforces exactly that and a password the
  // application would later reject would be a trap rather than a fixture.
  const password = `E2eStaff-${stamp}-7`
  const name = `E2E Staff ${label}`

  const result = await bootstrapAdmin(prisma, {
    email,
    password,
    name,
    organizationSlug: ORGANIZATION_SLUG,
  })

  // Anything but `created` means the address was not as unique as it looks,
  // and a spec that silently shares an identity is the bug this file exists to
  // remove - so it fails here rather than three assertions later.
  if (result.outcome !== 'created') {
    throw new Error(`Expected a freshly created administrator, got "${result.outcome}".`)
  }

  return { email, password, name }
}

/**
 * Signs in through the form a person uses.
 *
 * Deliberately not a programmatic session: the login page, the credentials
 * provider and the post-login redirect are all things these suites are
 * supposed to be exercising, and a fixture that forged a cookie would test the
 * forgery instead.
 */
export async function signInAsStaff(page: Page, admin: StaffAdmin): Promise<void> {
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(admin.email)
  await page.getByPlaceholder('Password').fill(admin.password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/dashboard/)
}

/** Creates an administrator and signs them in, which is what most specs want. */
export async function signInAsNewStaff(page: Page, label: string): Promise<StaffAdmin> {
  const admin = await createStaffAdmin(label)
  await signInAsStaff(page, admin)
  return admin
}

export async function disconnectStaffFixtures(): Promise<void> {
  await prisma.$disconnect()
}
