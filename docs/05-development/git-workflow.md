---
id: TRY-BNP-GIT-01
title: Git & Pull Request workflow
status: Approved
version: v1.0
---

# TRY-BNP-GIT-01 - Git & Pull Request workflow

**All development follows a Pull Request workflow. Direct commits to `main` are FORBIDDEN.**

```
main -> feature/<name> -> commits -> push -> Pull Request -> review -> squash-merge -> delete branch
```

- Product features: `feature/<name>`; process/docs/chores: `docs/<name>` or `chore/<name>`.
- Conventional Commits (commitlint-enforced).
- Before push, the full gate must pass: install, prisma generate, typecheck, lint, test,
  build.
- Open a PR with the template; do not merge your own PR; wait for a CODEOWNER review; then
  squash-merge and delete the branch.

See `CONTRIBUTING.md`, `GOVERNANCE.md`, `RELEASE.md`, `.github/BRANCH_PROTECTION.md`.

**Repository note:** no git remote is configured yet; until one is added and pushing is
authorised, branches/commits/gate/PR-document are produced locally and `git push` + the
GitHub PR are deferred.
