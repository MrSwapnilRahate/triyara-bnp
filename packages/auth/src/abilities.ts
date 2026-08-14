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
      ],
    )
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
