import { describe, expect, it } from 'vitest'

import { userRepository } from './user.repository'

// Integration test - runs only when a database is configured. Skipped otherwise so
// unit CI stays infra-free. Run locally: docker compose up -d && pnpm db:migrate && pnpm db:seed
describe.skipIf(!process.env.DATABASE_URL)('userRepository (integration)', () => {
  it('finds the seeded admin by email', async () => {
    const user = await userRepository.findByEmail('admin@triyaraexports.com')
    expect(user).not.toBeNull()
    expect(user?.roles.some((r) => r.role.name === 'ADMIN')).toBe(true)
  })
})
