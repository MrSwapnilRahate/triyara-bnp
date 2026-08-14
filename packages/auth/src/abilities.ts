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
