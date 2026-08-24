import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability'

import type { Role } from './roles'

// Actions and subjects. Subjects use string tokens now; when business models land
// they can be swapped for typed subjects without changing call sites.
//
// Declared as `as const` arrays with the unions DERIVED from them, rather than
// as bare type unions. The members are identical either way, but this gives the
// vocabulary a runtime representation - so anything that needs to enumerate it
// (the permission matrix, and the portal screen that renders it) reads these
// arrays instead of keeping a copy that can drift.
export const ACTIONS = ['manage', 'create', 'read', 'update', 'delete', 'verify'] as const
export type Action = (typeof ACTIONS)[number]

export const SUBJECTS = [
  'all',
  'Account',
  'SupplierProfile',
  'BuyerProfile',
  'Contact',
  'Address',
  'Verification',
  'Document',
  'Note',
  'Activity',
  'User',
  'Organization',
  'ReferenceData',
  // RFQs and quotations used to be authorized as `Account`, because there was
  // no subject for them. That made "may edit a customer record" and "may raise
  // an RFQ" the same permission, and it made deleting an RFQ require the right
  // to delete the customer. They are their own resources; they get their own
  // subjects.
  'RFQ',
  'Quotation',
  // Catalogue records, previously authorized as `ReferenceData` alongside
  // specification definitions and tag vocabularies. That made "may edit the tag
  // list" and "may delete a product" the same permission. No role gains or
  // loses anything here: reads still come from `read all` and writes from
  // ADMIN's `manage all`, exactly as the two services already documented.
  'Product',
  'Category',
  // The audit trail and the login-attempt trail, previously authorized as
  // `Organization`. That subject was chosen for its effect - `manage
  // Organization` resolves to ADMIN only - and not because a trail is an
  // organization, which left "may rename the tenant" and "may read every
  // before/after payload recorded in it" as one permission.
  //
  // It stays at `manage`, deliberately. Every role holds `read all`, so
  // `read AuditLog` would hand both trails to EXPORTER, VERIFIER and
  // READ_ONLY - the widening the audit route already warns about, since the
  // trail carries the payloads of every entity in the tenant and is therefore
  // more revealing than any single module's read. ADMIN reaches it through
  // `manage all`, so no role rule below needs to mention it.
  'AuditLog',
  // The standalone supplier master and everything hanging off it - contacts,
  // certifications, documents, notes, product offerings, matching. Previously
  // authorized as `SupplierProfile`, which is a different Prisma model: the
  // profile attached to an Account. Two unrelated records shared one
  // permission, so "may maintain an account's supplier profile" and "may
  // delete the supplier master's certifications" could not be told apart.
  //
  // Unlike the earlier subject splits this one is NOT behaviour-preserving on
  // its own: EXPORTER holds create/update on SupplierProfile, and a new
  // subject starts with nothing. The grant below restores it deliberately -
  // see the role rules.
  'Supplier',
  // Public quote request intake (TRY-BNP-QR-01). NOT authorized as `RFQ`, and
  // the distinction is the point: an intake record is an unqualified lead from
  // a stranger, an RFQ is a commercial sourcing document. Sharing a subject
  // would make "may triage website enquiries" and "may raise an RFQ against the
  // supplier network" the same permission, in both directions.
  //
  // Reads come from `read all` as usual, so every internal role can see the
  // queue. Writes are granted below to ADMIN and EXPORTER only.
  'QuoteRequest',
] as const
export type Subject = (typeof SUBJECTS)[number]

export type AppAbility = MongoAbility<[Action, Subject]>

// Permission definitions per role (TRY-BNP-PRD-01 role matrix).
export function buildAbilityFor(roles: Role[]): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility)
  const has = (r: Role) => roles.includes(r)

  if (has('ADMIN')) {
    can('manage', 'all')
  }

  if (has('EXPORTER')) {
    can('read', 'all')
    can(
      ['create', 'update'],
      [
        'Account',
        'SupplierProfile',
        'BuyerProfile',
        'Contact',
        'Address',
        'Document',
        'Note',
        'Activity',
        // Named rather than inherited. An exporter could already raise and
        // edit both, through `create/update Account`; this says so directly
        // instead of letting it fall out of a permission about customers.
        // `manage` and `delete` are deliberately still absent, so awarding,
        // reopening and deletion stay with ADMIN exactly as before.
        'RFQ',
        'Quotation',
        // The supplier master, which an exporter already maintained
        // through `create/update SupplierProfile` when the two models shared a
        // subject. Named here so the split changes no answer: the supplier
        // master service documents this exact contract - "create/update ->
        // ADMIN and EXPORTER" - and a test has asserted since it was
        // written that an exporter may onboard a supplier.
        //
        // `manage` and `delete` stay absent, so approving and removing a
        // supplier remain ADMIN's, exactly as before.
        'Supplier',
      ],
    )
    // Triage of website enquiries. `update` only - `create` is deliberately
    // absent for every role, because the sole way an intake record comes into
    // existence is a member of the public submitting one, and `delete` is
    // absent because a junk enquiry is REJECTED with a reason rather than
    // erased. ADMIN reaches both through `manage all` if it ever needs to.
    can('update', 'QuoteRequest')
  }

  if (has('VERIFIER')) {
    can('read', 'all')
    can(['verify', 'update'], 'Verification')
    can('create', ['Note', 'Activity', 'Document'])
  }

  if (has('READ_ONLY')) {
    can('read', 'all')
  }

  // EXTERNAL_PARTY has no branch, and that is the whole of this batch.
  //
  // An authenticated Buyer or Supplier can sign in and reach nothing. Every
  // role above holds `read all`, which inside one tenant is right for internal
  // staff and catastrophic for an external party - it would hand one buyer the
  // other buyers, and both the supplier network. Opening anything to them needs
  // record-level conditions scoped by `AuthContext.accountId`, which is a later
  // batch; until it exists the correct grant is none.
  //
  // Do not "temporarily" give this role a rule to make a screen work.

  return build()
}
