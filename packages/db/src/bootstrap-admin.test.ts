import { describe, expect, it } from 'vitest'

import { parseBootstrapConfig } from './bootstrap-admin'

/**
 * Configuration parsing, which is where a bootstrap most plausibly goes wrong:
 * a shell variable that expanded to nothing, or a password the application
 * would later refuse to accept at the change-password form.
 */

const valid = {
  BOOTSTRAP_ADMIN_EMAIL: 'owner@example.com',
  BOOTSTRAP_ADMIN_PASSWORD: 'Correct-Horse-9',
} as NodeJS.ProcessEnv

describe('it fails closed rather than guessing', () => {
  it('refuses a missing email', () => {
    const env = { ...valid, BOOTSTRAP_ADMIN_EMAIL: undefined }
    expect(() => parseBootstrapConfig(env)).toThrow(/BOOTSTRAP_ADMIN_EMAIL is required/)
  })

  it('refuses an email that expanded to whitespace', () => {
    // The realistic failure: `EMAIL=$UNSET_VAR` in a shell.
    const env = { ...valid, BOOTSTRAP_ADMIN_EMAIL: '   ' }
    expect(() => parseBootstrapConfig(env)).toThrow(/BOOTSTRAP_ADMIN_EMAIL is required/)
  })

  it('refuses a missing password', () => {
    const env = { ...valid, BOOTSTRAP_ADMIN_PASSWORD: undefined }
    expect(() => parseBootstrapConfig(env)).toThrow(/BOOTSTRAP_ADMIN_PASSWORD is required/)
  })

  it('refuses a malformed email', () => {
    const env = { ...valid, BOOTSTRAP_ADMIN_EMAIL: 'not-an-email' }
    expect(() => parseBootstrapConfig(env)).toThrow(/not a valid email/)
  })

  it('reports every problem at once', () => {
    // Three round trips to discover three problems is how people end up
    // weakening the password to make the command shut up.
    const env = {} as NodeJS.ProcessEnv
    expect(() => parseBootstrapConfig(env)).toThrow(/EMAIL is required[\s\S]*PASSWORD is required/)
  })
})

describe('the password must satisfy what the app will later demand', () => {
  it.each([
    ['too short', 'Ab1cdefghij'],
    ['no lowercase', 'ABCDEFGHIJK1'],
    ['no uppercase', 'abcdefghijk1'],
    ['no digit', 'AbCdEfGhIjKl'],
  ])('refuses a password with %s', (_label, password) => {
    expect(() => parseBootstrapConfig({ ...valid, BOOTSTRAP_ADMIN_PASSWORD: password })).toThrow(
      /BOOTSTRAP_ADMIN_PASSWORD/,
    )
  })

  it('accepts one that meets every rule', () => {
    const config = parseBootstrapConfig({ ...valid, BOOTSTRAP_ADMIN_PASSWORD: 'Sufficient-1-Pass' })
    expect(config.email).toBe('owner@example.com')
  })

  it('matches the change-password policy: 12 chars, lower, upper, digit', () => {
    // If these two ever diverge, a bootstrap password would be accepted here
    // and rejected by the app's own form - a trap rather than a convenience.
    expect(() =>
      parseBootstrapConfig({ ...valid, BOOTSTRAP_ADMIN_PASSWORD: 'Ab1cdefghijk' }),
    ).not.toThrow()
    expect(() =>
      parseBootstrapConfig({ ...valid, BOOTSTRAP_ADMIN_PASSWORD: 'Ab1cdefghij' }),
    ).toThrow()
  })
})

describe('normalisation and defaults', () => {
  it('lowercases and trims the email, because the login lookup does', () => {
    const config = parseBootstrapConfig({ ...valid, BOOTSTRAP_ADMIN_EMAIL: '  Owner@Example.COM ' })
    expect(config.email).toBe('owner@example.com')
  })

  it('defaults the organization slug to the tenant public registration uses', () => {
    expect(parseBootstrapConfig(valid).organizationSlug).toBe('triyara')
  })

  it('lets the organization slug be overridden', () => {
    const env = { ...valid, BOOTSTRAP_ADMIN_ORG_SLUG: 'other-tenant' }
    expect(parseBootstrapConfig(env).organizationSlug).toBe('other-tenant')
  })

  it('defaults the display name', () => {
    expect(parseBootstrapConfig(valid).name).toBe('Triyara Administrator')
  })
})

describe('the error text must not become a credential leak', () => {
  it('never repeats the password back', () => {
    // Error messages get pasted into chats and issue trackers.
    const secret = 'short'
    try {
      parseBootstrapConfig({ ...valid, BOOTSTRAP_ADMIN_PASSWORD: secret })
      throw new Error('expected a rejection')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      expect(message).not.toContain(secret)
      expect(message).toContain('BOOTSTRAP_ADMIN_PASSWORD')
    }
  })
})
