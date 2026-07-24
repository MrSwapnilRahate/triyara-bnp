# Summary

<!-- What does this PR do, in 2-3 sentences? Link the phase doc / ADR. -->

# Business Motivation

<!-- Why does this matter to Triyara? What user/business problem does it solve? -->

# Architecture Impact

<!-- Layers touched, new modules, boundaries, frozen modules respected. -->

# Database Changes

<!-- New tables/columns/enums, migration name, indexes, backfill needs. -->

# API Changes

<!-- New/changed endpoints, request/response shape, envelope, versioning. -->

# UI Changes

<!-- New pages/components, states (loading/empty/error/success), navigation. -->

# Events Added/Consumed

<!-- Domain events emitted or consumed; new subscribers. Projections must not emit. -->

# Security Considerations

<!-- requireAuth, org isolation, recipient/owner isolation, validation, secrets/PII. -->

# Performance Considerations

<!-- Cursor pagination, explicit selects, N+1, streaming, payload sizes. -->

# Testing

<!-- Unit / repository / service / API / integration / e2e. Commands run and results. -->

# Screenshots

<!-- Screenshots or a short clip of the feature working in the browser. -->

# Rollback

<!-- Revert the squash commit; re-promote previous deploy; migration additive/reversible. -->

# Review Checklist

- [ ] **Architecture** - correct layer; no boundary violations; frozen modules untouched
- [ ] **Code Quality** - no `any`, no dead code, follows DEV-01 conventions
- [ ] **Performance** - cursor pagination, explicit Prisma selects, no N+1, streaming
- [ ] **Security** - input validated, secrets/PII safe, secure downloads/signed URLs
- [ ] **RBAC** - `requireAuth()` + `requireAbility()`; correct roles
- [ ] **Organization Isolation** - every query org-scoped (and recipient/owner-scoped)
- [ ] **Audit** - every mutation writes an AuditLog entry (actor, before/after, requestId)
- [ ] **Events** - correct emit/consume; projections emit nothing; names stable
- [ ] **Tests** - unit + integration + e2e; meaningful, deterministic, green
- [ ] **Documentation** - CHANGELOG + ADR updated; frozen contracts version-bumped
- [ ] **Accessibility** - semantic markup, keyboard reachable, labels, focus states
