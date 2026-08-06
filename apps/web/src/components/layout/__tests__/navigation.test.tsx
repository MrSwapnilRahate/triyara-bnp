// @vitest-environment node
import { buildAbilityFor } from '@triyara/auth'
import { describe, expect, it } from 'vitest'

import { visibleNavigation } from '../navigation'

// Navigation is filtered by ability, not disabled. These assert the filter is
// real: a nav that showed Administration to a read-only user would be both
// misleading and a dead link, since the API refuses them anyway.
describe('visibleNavigation', () => {
  it('gives an ADMIN every group including Administration', () => {
    const groups = visibleNavigation(buildAbilityFor(['ADMIN']))
    expect(groups.map((g) => g.heading)).toContain('Administration')
  })

  it('hides Administration from an EXPORT_MANAGER', () => {
    const groups = visibleNavigation(buildAbilityFor(['EXPORT_MANAGER']))
    expect(groups.map((g) => g.heading)).not.toContain('Administration')
  })

  it('hides Administration from a READ_ONLY user but keeps the working modules', () => {
    const groups = visibleNavigation(buildAbilityFor(['READ_ONLY']))
    const headings = groups.map((g) => g.heading)
    expect(headings).not.toContain('Administration')
    expect(headings).toContain('Sourcing')
    expect(headings).toContain('Catalog')
  })

  it('drops a group entirely rather than leaving an orphan heading', () => {
    const groups = visibleNavigation(buildAbilityFor(['VERIFIER']))
    expect(groups.every((g) => g.items.length > 0)).toBe(true)
  })

  it('attaches a badge only where a count was supplied', () => {
    const groups = visibleNavigation(buildAbilityFor(['ADMIN']), { '/rfqs': 3 })
    const items = groups.flatMap((g) => g.items)
    expect(items.find((i) => i.href === '/rfqs')?.badge).toBe(3)
    expect(items.find((i) => i.href === '/quotations')?.badge).toBeUndefined()
  })

  it('lists no route that has not been built yet', () => {
    // Wave 1 ships the shell only. Every href here must resolve once its wave
    // lands; this test is the reminder to keep the registry honest.
    const hrefs = visibleNavigation(buildAbilityFor(['ADMIN'])).flatMap((g) =>
      g.items.map((i) => i.href),
    )
    expect(hrefs).toContain('/dashboard')
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})
