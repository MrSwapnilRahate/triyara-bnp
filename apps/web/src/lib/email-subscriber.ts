import {
  buyerRegistrationRepository,
  supplierContactRepository,
  supplierRepository,
} from '@triyara/db'
import type { EmailService, Recipient } from '@triyara/email'
import type { DomainEvent } from '@triyara/events'

/**
 * Turns domain events into outbound email.
 *
 * This is a subscriber, not a change to the events themselves: every event is
 * emitted exactly as before, the in-app notifications are generated exactly as
 * before, and email is an additional channel hanging off the same bus. Nothing
 * here decides whether something happened - only who should hear about it.
 *
 * Recipients are looked up rather than carried on the event. The payloads were
 * designed for activity and notifications and hold ids, not addresses, and
 * widening them would change contracts that other subscribers already read.
 */

type Data = Record<string, unknown>

function str(data: Data, key: string): string | undefined {
  const value = data[key]
  return typeof value === 'string' ? value : undefined
}

/** Best contact to write to: primary first, and only ones with an address. */
function pickRecipient(
  contacts: { name: string; email: string | null; isPrimary?: boolean }[],
): Recipient | null {
  const withAddress = contacts.filter((c) => c.email)
  if (withAddress.length === 0) return null
  const chosen = withAddress.find((c) => c.isPrimary) ?? withAddress[0]
  return chosen ? { name: chosen.name, email: chosen.email } : null
}

/** Latest reviewer comment, so a rejection can say why rather than just no. */
function latestComment(
  history: { comments: string | null; reviewedAt: Date }[],
): string | undefined {
  if (history.length === 0) return undefined
  const sorted = [...history].sort((a, b) => b.reviewedAt.getTime() - a.reviewedAt.getTime())
  return sorted[0]?.comments ?? undefined
}

export function createEmailSubscriber(email: EmailService) {
  return async function onEvent(event: DomainEvent): Promise<void> {
    const data = (event.data ?? {}) as Data
    const orgId = event.organizationId

    switch (event.type) {
      case 'supplier.self_registered': {
        const supplierId = str(data, 'supplierId')
        const companyName = str(data, 'companyName')
        if (!supplierId || !companyName) return

        const contacts = await supplierContactRepository.list(orgId, supplierId)
        const contact = pickRecipient(contacts)
        if (contact) {
          await email.supplierRegistered({
            contact,
            companyName,
            supplierCode: str(data, 'supplierCode') ?? '',
          })
        }

        await email.staffNewRegistration({
          kind: 'supplier',
          companyName,
          ...(str(data, 'country') ? { country: str(data, 'country') as string } : {}),
          ...(str(data, 'supplierCode') ? { reference: str(data, 'supplierCode') as string } : {}),
        })
        return
      }

      case 'buyer.self_registered': {
        const accountId = str(data, 'accountId')
        const companyName = str(data, 'companyName')
        if (!accountId || !companyName) return

        const contacts = await buyerRegistrationRepository.contacts(orgId, accountId)
        const contact = pickRecipient(contacts)
        if (contact) {
          await email.buyerRegistered({ contact, companyName })
        }

        await email.staffNewRegistration({
          kind: 'buyer',
          companyName,
          ...(str(data, 'country') ? { country: str(data, 'country') as string } : {}),
        })
        return
      }

      case 'supplier.approved':
      case 'supplier.rejected': {
        const supplierId = str(data, 'supplierId')
        if (!supplierId) return

        const supplier = await supplierRepository.findById(orgId, supplierId)
        if (!supplier) return

        const contacts = await supplierContactRepository.list(orgId, supplierId)
        const contact = pickRecipient(contacts)
        if (!contact) return

        const history = await supplierRepository.approvalHistory(orgId, supplierId)
        const comments = latestComment(history)

        await email.registrationDecided({
          kind: 'supplier',
          decision: event.type === 'supplier.approved' ? 'approved' : 'rejected',
          contact,
          companyName: supplier.companyName,
          ...(comments ? { comments } : {}),
        })
        return
      }

      case 'buyer.approved':
      case 'buyer.rejected': {
        const accountId = str(data, 'accountId')
        if (!accountId) return

        const account = await buyerRegistrationRepository.findById(orgId, accountId)
        if (!account) return

        const contacts = await buyerRegistrationRepository.contacts(orgId, accountId)
        const contact = pickRecipient(contacts)
        if (!contact) return

        const history = await buyerRegistrationRepository.approvalHistory(orgId, accountId)
        const comments = latestComment(history)

        await email.registrationDecided({
          kind: 'buyer',
          decision: event.type === 'buyer.approved' ? 'approved' : 'rejected',
          contact,
          companyName: account.legalName,
          ...(comments ? { comments } : {}),
        })
        return
      }

      default:
        // Every other event stays in-app only. Email is deliberately reserved
        // for the moments someone outside the team is waiting on an answer.
        return
    }
  }
}
