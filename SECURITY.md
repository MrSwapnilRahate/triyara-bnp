# Security Policy

## Supported versions

The `main` branch and the latest tagged release receive security fixes.

## Reporting a vulnerability (responsible disclosure)

**Do not open a public issue for security problems.** Report privately to
`security@triyaraexports.com` (or a GitHub private security advisory). Include steps to
reproduce and impact. We aim to acknowledge within 3 business days and to patch
high-severity issues promptly. Please give us reasonable time to remediate before any
public disclosure.

## Secrets

- Never commit secrets. Use environment variables (`.env`, never committed) and a secrets
  manager (Doppler / platform env) in deployed environments.
- `.env` is git-ignored; `.env.example` documents required keys with placeholders only.
- Rotate `AUTH_SECRET`, database and storage credentials on exposure.

## Dependency updates

- Dependabot raises weekly grouped updates and automatic **security** patches
  (`.github/dependabot.yml`).
- Security-flagged updates are prioritised and merged after CI passes.

## PII handling

- Partner and user data is confidential PII. Never log secrets or PII (the Pino logger
  redacts known fields).
- Consent (timestamp + policy version) is captured at registration and is immutable.
- Support data-deletion requests; documents are access-controlled with short-lived signed
  URLs.

## RBAC review

Every endpoint and server action enforces `requireAuth()` and, where it mutates or reads
scoped data, `requireAbility()`. Reviewers must confirm the correct ability/role for each
new endpoint. Only Verifier/Admin may approve verifications.

## Organization isolation checklist

- [ ] Every query is filtered by `organizationId`.
- [ ] Recipient/owner-scoped reads (e.g. notifications) also filter by recipient.
- [ ] Storage keys are org-prefixed and verified before use.
- [ ] No cross-org identifiers are accepted from the client without re-validation.
- [ ] Audit entries carry the acting org and actor.
