import { beforeEach, describe, expect, it } from 'vitest'

import { createEmailService, isSendableAddress } from './service'
import type { EmailMessage, EmailTransport, SendResult } from './types'

function recorder() {
  const lines: { level: string; obj: Record<string, unknown>; msg: string }[] = []
  return {
    lines,
    logger: {
      info: (obj: Record<string, unknown>, msg: string) => lines.push({ level: 'info', obj, msg }),
      warn: (obj: Record<string, unknown>, msg: string) => lines.push({ level: 'warn', obj, msg }),
      error: (obj: Record<string, unknown>, msg: string) =>
        lines.push({ level: 'error', obj, msg }),
    },
    msgs: () => lines.map((l) => l.msg),
  }
}

function fakeTransport(result?: SendResult) {
  const sent: EmailMessage[] = []
  const transport: EmailTransport = {
    name: 'fake',
    send(message) {
      sent.push(message)
      return Promise.resolve(result ?? { status: 'sent', id: 'id_1', attempts: 1 })
    },
  }
  return { transport, sent }
}

const BASE = {
  appUrl: 'https://bnp.example.com/',
  staffRecipients: ['ops@example.com'],
}

describe('isSendableAddress', () => {
  it('accepts ordinary addresses', () => {
    expect(isSendableAddress('a@b.com')).toBe(true)
    expect(isSendableAddress('first.last+tag@sub.example.co.in')).toBe(true)
  })

  it('rejects what cannot possibly work', () => {
    expect(isSendableAddress(null)).toBe(false)
    expect(isSendableAddress(undefined)).toBe(false)
    expect(isSendableAddress('')).toBe(false)
    expect(isSendableAddress('not-an-address')).toBe(false)
    expect(isSendableAddress('missing@domain')).toBe(false)
    expect(isSendableAddress('two spaces@x.com')).toBe(false)
  })
})

describe('email service', () => {
  let log: ReturnType<typeof recorder>

  beforeEach(() => {
    log = recorder()
  })

  it('sends a supplier confirmation carrying the reference', async () => {
    const { transport, sent } = fakeTransport()
    const email = createEmailService({ transport, logger: log.logger, ...BASE })

    const result = await email.supplierRegistered({
      contact: { name: 'Anita Rao', email: 'anita@sunrise.example' },
      companyName: 'Sunrise Foods',
      supplierCode: 'SUP-0042',
    })

    expect(result.status).toBe('sent')
    expect(sent).toHaveLength(1)
    expect(sent[0]?.to).toEqual(['anita@sunrise.example'])
    expect(sent[0]?.subject).toContain('SUP-0042')
    // Both bodies, always: some clients show only one of them.
    expect(sent[0]?.html).toContain('Sunrise Foods')
    expect(sent[0]?.text).toContain('SUP-0042')
    expect(log.msgs()).toContain('email.sent')
  })

  it('skips a contact who has no address instead of failing', async () => {
    // The registration wizards accept a contact reachable only by WhatsApp, so
    // this is a normal state of the data, not an error.
    const { transport, sent } = fakeTransport()
    const email = createEmailService({ transport, logger: log.logger, ...BASE })

    const result = await email.supplierRegistered({
      contact: { name: 'Phone Only', email: null },
      companyName: 'Sunrise Foods',
      supplierCode: 'SUP-0042',
    })

    expect(result.status).toBe('skipped')
    expect(sent).toHaveLength(0)
    expect(log.msgs()).toContain('email.contact_has_no_address')
  })

  it('never throws when the transport throws', async () => {
    // A confirmation that cannot be sent must not roll back a registration
    // that is already saved.
    const throwing: EmailTransport = {
      name: 'broken',
      send: () => Promise.reject(new Error('socket hang up')),
    }
    const email = createEmailService({ transport: throwing, logger: log.logger, ...BASE })

    const result = await email.buyerRegistered({
      contact: { name: 'Buyer', email: 'buyer@example.com' },
      companyName: 'Northwind Trading',
    })

    expect(result.status).toBe('failed')
    expect(log.msgs()).toContain('email.failed')
  })

  it('reports a transport failure as failed, with the attempt count', async () => {
    const { transport } = fakeTransport({
      status: 'failed',
      error: 'rate limited',
      attempts: 3,
      retryable: true,
    })
    const email = createEmailService({ transport, logger: log.logger, ...BASE })

    const result = await email.buyerRegistered({
      contact: { name: 'Buyer', email: 'buyer@example.com' },
      companyName: 'Northwind Trading',
    })

    expect(result).toMatchObject({ status: 'failed', attempts: 3, retryable: true })
    const failure = log.lines.find((l) => l.msg === 'email.failed')
    expect(failure?.obj).toMatchObject({ attempts: 3, transport: 'fake' })
  })

  it('warns rather than silently doing nothing when no staff address is set', async () => {
    // With nobody configured, registrations would pile up entirely unseen.
    const { transport, sent } = fakeTransport()
    const email = createEmailService({
      transport,
      logger: log.logger,
      appUrl: BASE.appUrl,
      staffRecipients: [],
    })

    const result = await email.staffNewRegistration({
      kind: 'supplier',
      companyName: 'Sunrise Foods',
    })

    expect(result.status).toBe('skipped')
    expect(sent).toHaveLength(0)
    expect(log.msgs()).toContain('email.no_staff_recipients_configured')
  })

  it('builds a review link without doubling the slash', async () => {
    const { transport, sent } = fakeTransport()
    const email = createEmailService({ transport, logger: log.logger, ...BASE })

    await email.staffNewRegistration({
      kind: 'buyer',
      companyName: 'Northwind Trading',
      country: 'Netherlands',
    })

    expect(sent[0]?.text).toContain('https://bnp.example.com/buyers')
    expect(sent[0]?.text).not.toContain('.com//')
  })

  it('puts the reviewer comment in a rejection', async () => {
    const { transport, sent } = fakeTransport()
    const email = createEmailService({ transport, logger: log.logger, ...BASE })

    await email.registrationDecided({
      kind: 'supplier',
      decision: 'rejected',
      contact: { name: 'Anita Rao', email: 'anita@sunrise.example' },
      companyName: 'Sunrise Foods',
      comments: 'FSSAI certificate had expired.',
    })

    expect(sent[0]?.text).toContain('FSSAI certificate had expired.')
    expect(sent[0]?.html).toContain('FSSAI certificate had expired.')
  })

  it('escapes company names that carry markup characters', async () => {
    const { transport, sent } = fakeTransport()
    const email = createEmailService({ transport, logger: log.logger, ...BASE })

    await email.registrationDecided({
      kind: 'buyer',
      decision: 'approved',
      contact: { name: 'B & B <ops>', email: 'ops@bb.example' },
      companyName: 'Smith & Sons <Trading>',
    })

    expect(sent[0]?.html).toContain('Smith &amp; Sons &lt;Trading&gt;')
    expect(sent[0]?.html).not.toContain('<Trading>')
  })

  it('percent-encodes the reset token in the link', async () => {
    const { transport, sent } = fakeTransport()
    const email = createEmailService({ transport, logger: log.logger, ...BASE })

    await email.passwordReset({ email: 'user@example.com', token: 'a+b/c=', expiresInMinutes: 60 })

    expect(sent[0]?.text).toContain('token=a%2Bb%2Fc%3D')
    expect(sent[0]?.text).toContain('60 minutes')
  })

  it('applies replyTo when configured', async () => {
    const { transport, sent } = fakeTransport()
    const email = createEmailService({
      transport,
      logger: log.logger,
      ...BASE,
      replyTo: 'sourcing@example.com',
    })

    await email.buyerRegistered({
      contact: { name: 'Buyer', email: 'buyer@example.com' },
      companyName: 'Northwind Trading',
    })

    expect(sent[0]?.replyTo).toBe('sourcing@example.com')
  })

  it('renders a staff invite even though nothing calls it yet', async () => {
    // The invitation link points at /reset-password, the page that actually
    // consumes a PasswordResetToken - which is what an invitation carries.
    const { transport, sent } = fakeTransport()
    const email = createEmailService({ transport, logger: log.logger, ...BASE })

    await email.staffInvite({
      email: 'newstaff@example.com',
      inviterName: 'Swapnil',
      token: 'tok123',
      expiresInHours: 48,
    })

    expect(sent[0]?.text).toContain('https://bnp.example.com/reset-password?token=tok123')
    expect(sent[0]?.text).toContain('48 hours')
  })
})
