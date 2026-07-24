---
id: ADR-0007
title: Notification Center as a second event subscriber
status: Accepted
date: 2026-07-21
deciders: [Platform]
---

# ADR-0007: Notification Center as a second event subscriber

## Context

Users need per-recipient notifications for platform activity, with preferences and
multi-channel readiness - without modifying any frozen module, emitting new events, or
duplicating Activity (TRY-BNP-ACTIVITY-01, API-01).

## Decision

- **Second subscriber**: the composition-root event bus already fans events to the
  Activity sink; a Notification sink is added beside it. Both are best-effort and awaited
  within the request. No producer, event name, or contract changes; no new events.
- **Per-recipient projection**: one `Notification` message fans out to
  `NotificationRecipient` rows (read/archived state per user - recipient isolation).
  A separate mapper produces title/body/priority/type (distinct from the Activity mapper).
- **Preferences** (`NotificationPreference`, per user per type): default enabled/in-app;
  a missing row means default. The subscriber filters recipients by enabled + not muted.
- **Multi-channel delivery** (`NotificationDelivery`): in-app is DELIVERED immediately;
  email / webhook / push are QUEUED for a future dispatcher (interface only).
- **Plain-ID references**: recipient/actor/entity/account are plain columns - no relations
  to frozen User / Account / Document / Verification models.
- Recipient fan-out uses a new read-only `orgUserRepository` (new db file; frozen auth /
  userRepository untouched).

## Alternatives

- Generate notifications inside producers: rejected - would modify frozen modules.
- Reuse Activity rows as notifications: rejected - notifications are per-recipient with
  read state, preferences and delivery; a different concern.
- Exclude the actor from recipients: deferred - V1 includes the actor so the feature is
  demonstrable with one user; preferences let anyone mute.

## Trade-offs

- Fan-out to all active org users can be noisy at scale; preferences + (future) digests
  mitigate. Delivery for external channels is queued but not dispatched yet.
- Ingestion is post-commit/best-effort (correct for notifications; the AuditLog remains
  the transactional source of truth).

## Consequences

- Every platform action now reaches the right users in-app, with a bell + center, and any
  future module's events are picked up automatically.

## References

- TRY-BNP-DB-01, API-01, DEV-01, AUTH-01, ACCOUNT-01, SUPPLIER-01, DOCUMENT-01,
  VERIFICATION-01, ACTIVITY-01; ADR-0006.
