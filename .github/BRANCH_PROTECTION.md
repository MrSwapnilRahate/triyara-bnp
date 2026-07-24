# Branch Protection & GitHub Actions Protection

Recommended settings for `main` (configure in GitHub repo settings once a remote exists).

## Protect `main`

- Require a pull request before merging (**no direct pushes**).
- Require **1** approving review from a **CODEOWNER**.
- Dismiss stale approvals when new commits are pushed.
- Require **linear history** (squash-merge only).
- Require conversation resolution before merge.
- Restrict who can push to `main` (maintainers only, emergencies).
- Do not allow force-pushes or deletion of `main`.

## Required status checks (from `.github/workflows/ci.yml`)

All must pass before merge:

- `quality` - lint, typecheck, tests, build
- `security` - dependency review

Require branches to be up to date before merging.

## GitHub Actions hardening

- Set workflow permissions to **read-only** by default; grant write per-job as needed.
- Pin third-party actions to a commit SHA (or at minimum a major version).
- Use environments with required reviewers for production deploys; store deploy secrets
  (`VERCEL_TOKEN`, etc.) as environment secrets, never in the repo.
- Enable Dependabot for `github-actions` (see `dependabot.yml`).
