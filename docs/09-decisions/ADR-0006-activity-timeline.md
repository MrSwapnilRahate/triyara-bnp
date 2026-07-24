---
id: ADR-0006
title: Activity timeline via event-subscriber ingestion
status: Accepted
date: 2026-07-21
deciders: [Platform]
---

# ADR-0006: Activity timeline via event-subscriber ingestion

## Context

An org-wide activity feed must reflect actions across accounts, suppliers, documents and
verifications - and future modules - without duplicating business logic or emitting new
events, and without modifying any frozen module (ACCOUNT/SUPPLIER/DOCUMENT/VERIFICATION/
AUTH). The event model (API-01) was designed so Activity is "just another subscriber".

## Decision

- **Consume, never re-emit**: Activity subscribes to the existing in-process event bus.
  It adds no events and contains no domain rules - only mapping + persistence.
- **Composition-root subscriber**: a shared event bus preserves the existing logging and
  attaches the Activity ingestion. It is wired by swapping the injected `events`
  dependency in the four `apps/web/src/lib/*-service.ts` composition files. This changes
  no module logic, contract, or event name - only the listener attached at the seam.
  (The alternative, a global registry + `instrumentation.ts`, risks non-deterministic
  module-instance sharing across Next bundles; the explicit DI swap is deterministic.)
- **Best-effort ingestion**: the subscriber write is awaited within the request (so it
  completes on serverless) but wrapped so a failure is logged and never fails the
  business mutation.
- **Pure mapper** (`mapEventToActivity`): entity type from the event prefix, activity type
  from the action suffix, plain-ID references, raw payload as `metadata` (ActivityMetadata).
  Unknown prefixes map to a generic activity, so future modules appear with no changes.
- **No relations to frozen models**: Activity references account/actor/entity by plain ID.

## Alternatives

- Write activity inside each service: rejected - couples modules to the feed and would
  modify frozen code.
- A per-entity activity table: rejected - one generic feed, driven by events, is simpler
  and future-proof.
- `instrumentation.ts` global registry: rejected for determinism (bundle module identity).

## Trade-offs

- Ingestion is post-commit relative to the business transaction (eventual, best-effort) -
  correct for an activity feed; not a source of truth (the AuditLog remains that).
- `DOWNLOADED` has no producer (downloads emit no event and we must not add one).

## Consequences

- Every state change across the platform now appears in a global feed and per-account
  timeline, and any future module's events are ingested automatically.

## References

- TRY-BNP-DB-01, API-01, DEV-01, AUTH-01, ACCOUNT-01, SUPPLIER-01, DOCUMENT-01,
  VERIFICATION-01; ADR-0004, ADR-0005.
