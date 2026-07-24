# Governance

## Roles

- **Maintainers / Platform** - own architecture, CI, releases, and the frozen-module
  policy.
- **Reviewers (CODEOWNERS)** - approve changes in their area (`.github/CODEOWNERS`).
- **Contributors** - anyone opening a PR under the workflow.

## Decision records

Significant technical decisions are captured as ADRs in `docs/09-decisions/`
(template `ADR-0000`). The TDR (`TRY-BNP-TDR-01`) summarises stack decisions; each links
to its ADR.

## Frozen-module policy

Once a module is approved and tagged, it is **frozen**: its schema, domain logic, API and
contracts do not change. New capabilities **extend** frozen modules (by reference / plain
IDs, new subscribers, or new modules) and must never modify them. PRs are rejected if they
touch a frozen module's behaviour.

## Change control

- Every change lands via PR (TRY-BNP-GIT-01). No direct commits to `main`.
- Required: 1 CODEOWNER approval + green CI.
- **Merge strategy:** squash-merge only; linear history; delete branch after merge.

## Review requirements

Reviewers verify the PR checklist: Architecture, Code Quality, Performance, Security,
RBAC, Organization Isolation, Audit, Events, Tests, Documentation, Accessibility.

## Versioning & releases

Semantic Versioning; see `RELEASE.md`.
