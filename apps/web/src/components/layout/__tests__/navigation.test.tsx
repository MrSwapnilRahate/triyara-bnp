// @vitest-environment node
import { existsSync } from 'node:fs'
import { join } from 'node:path'

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

  it('hides Administration from an EXPORTER', () => {
    const groups = visibleNavigation(buildAbilityFor(['EXPORTER']))
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

  it('gates the audit entry on AuditLog, not on organization management', () => {
    // The entry followed the backend to `manage AuditLog`. Every configured
    // role answers the same for both subjects, so only an actor built by hand
    // can tell which one the registry asks about.
    const auditor = { can: (_a: string, s: string) => s === 'AuditLog' }
    const tenantAdmin = { can: (_a: string, s: string) => s === 'Organization' }

    const href = (ability: { can: (a: string, s: string) => boolean }) =>
      visibleNavigation(ability as Parameters<typeof visibleNavigation>[0])
        .flatMap((g) => g.items)
        .map((i) => i.href)

    expect(href(auditor)).toContain('/admin/audit')
    expect(href(tenantAdmin)).not.toContain('/admin/audit')
    // The organization entry is the mirror image, and stays where it was.
    expect(href(tenantAdmin)).toContain('/admin/organization')
    expect(href(auditor)).not.toContain('/admin/organization')
  })

  it.each(['EXPORTER', 'VERIFIER', 'READ_ONLY'] as const)(
    'keeps the audit entry hidden from %s',
    (role) => {
      // Unchanged by the subject move: `read all` covers AuditLog, so the entry
      // would reappear for all three if it were ever gated at `read`.
      const hrefs = visibleNavigation(buildAbilityFor([role]))
        .flatMap((g) => g.items)
        .map((i) => i.href)
      expect(hrefs).not.toContain('/admin/audit')
    },
  )

  it('still shows the audit entry to an ADMIN', () => {
    const hrefs = visibleNavigation(buildAbilityFor(['ADMIN']))
      .flatMap((g) => g.items)
      .map((i) => i.href)
    expect(hrefs).toContain('/admin/audit')
  })

  it('lists no route that has not been built yet', () => {
    // Wave 1 ships the shell only. Every href here must resolve once its wave
    // lands; this test is the reminder to keep the registry honest.
    const hrefs = visibleNavigation(buildAbilityFor(['ADMIN'])).flatMap((g) =>
      g.items.map((i) => i.href),
    )
    expect(hrefs).toContain('/dashboard')
    expect(new Set(hrefs).size).toBe(hrefs.length)

    // The reminder above, made enforceable. `/admin/api-docs` had no page and
    // was shown to ADMIN for months, so the entry pointed at a 404 rather than
    // being caught by the rule this test describes.
    expect(hrefs).not.toContain('/admin/api-docs')
  })

  it('names only routes that have a page, across the whole registry', () => {
    // The invariant this file has claimed since it was written, finally applied
    // to EVERY entry rather than one section. Scoping an earlier version to
    // `/admin/` is why `/catalog/specifications` and `/catalog/tags` sat in the
    // sidebar pointing at 404s - ungated, so every role saw them.
    //
    // Resolved against the filesystem, so a new entry is checked automatically
    // and no list here can go stale. `page.tsx` specifically: a directory alone
    // does not make a route, which is the exact shape that slipped through.
    const appDir = join(process.cwd(), 'src/app/(app)')
    const hrefs = visibleNavigation(buildAbilityFor(['ADMIN']))
      .flatMap((g) => g.items)
      .map((i) => i.href)

    const missing = hrefs.filter((h) => !existsSync(join(appDir, h, 'page.tsx')))
    expect(missing).toEqual([])
  })

  it('checks the registry against every role, not only ADMIN', () => {
    // ADMIN sees the most, but an entry with no `requires` is shown to everyone
    // - which is what made the two catalog entries reachable by READ_ONLY.
    const appDir = join(process.cwd(), 'src/app/(app)')
    for (const role of ['ADMIN', 'EXPORTER', 'VERIFIER', 'READ_ONLY'] as const) {
      const missing = visibleNavigation(buildAbilityFor([role]))
        .flatMap((g) => g.items)
        .map((i) => i.href)
        .filter((h) => !existsSync(join(appDir, h, 'page.tsx')))
      expect(missing, role).toEqual([])
    }
  })
})
