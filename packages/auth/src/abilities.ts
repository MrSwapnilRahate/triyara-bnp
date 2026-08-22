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
  // `read AuditLog` would hand both trails to EXPORT_MANAGER, VERIFIER and
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
  // its own: EXPORT_MANAGER holds create/update on SupplierProfile, and a new
  // subject starts with nothing. The grant below restores it deliberately -
  // see the role rules.
  'Supplier',
  // Pre-commercial export cost scenarios (V3, ADR-0012). NOT authorized as
  // `Quotation`: reusing it would give scenario access to everyone holding
  // quotation rights and the reverse, conflating a private cost exploration
  // with a document a buyer has been sent.
  //
  // Like `Supplier`, a new subject starts with nothing, so the grant below is
  // deliberate rather than inherited - and it is the only place in this file
  // that V3 adds. No existing subject's grant is touched.
  'CostScenario',
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

  if (has('EXPORT_MANAGER')) {
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
        // Named rather than inherited. An export manager could already raise and
        // edit both, through `create/update Account`; this says so directly
        // instead of letting it fall out of a permission about customers.
        // `manage` and `delete` are deliberately still absent, so awarding,
        // reopening and deletion stay with ADMIN exactly as before.
        'RFQ',
        'Quotation',
        // The supplier master, which an export manager already maintained
        // through `create/update SupplierProfile` when the two models shared a
        // subject. Named here so the split changes no answer: the supplier
        // master service documents this exact contract - "create/update ->
        // ADMIN and EXPORT_MANAGER" - and a test has asserted since it was
        // written that an export manager may onboard a supplier.
        //
        // `manage` and `delete` stay absent, so approving and removing a
        // supplier remain ADMIN's, exactly as before.
        'Supplier',
        // A cost scenario is a working document, not a commercial commitment,
        // so an export manager owns its whole life - including deletion, which
        // is why `delete` is granted separately just below. That is the one
        // place this subject departs from the RFQ and Quotation rule above,
        // and it is deliberate: withdrawing a quotation a buyer has seen is an
        // administrative act, discarding your own draft calculation is not.
        'CostScenario',
      ],
    )
    // Restore rides on `update`, matching RFQ, Supplier, Product and Category.
    can('delete', 'CostScenario')
  }

  if (has('VERIFIER')) {
    can('read', 'all')
    can(['verify', 'update'], 'Verification')
    can('create', ['Note', 'Activity', 'Document'])
  }

  if (has('READ_ONLY')) {
    can('read', 'all')
  }

  return build()
}
