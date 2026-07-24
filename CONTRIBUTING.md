# Contributing

Thanks for contributing to the Triyara Business Network Platform. This guide covers
setup and the mandatory workflow.

## Repository setup

Prerequisites: **Node 20 LTS** (see `.nvmrc`), **pnpm 10**, **Docker**, **Git**.

```bash
pnpm install
cp .env.example .env          # fill AUTH_SECRET, DATABASE_URL
docker compose up -d          # Postgres + Redis
pnpm db:migrate && pnpm db:seed
pnpm dev                      # http://localhost:3000
```

## Migration workflow

- Edit `packages/db/prisma/schema.prisma`.
- `pnpm prisma generate` (updates the client/types).
- `pnpm --filter @triyara/db db:migrate` to create a migration against a running DB.
- Migrations are **expand-then-contract** and backward-compatible; never edit an applied
  migration.

## Branch strategy (TRY-BNP-GIT-01)

```
main -> feature/<name> -> commits -> push -> Pull Request -> review -> squash-merge -> delete branch
```

- **Never commit to `main`.** Every change starts from the latest `main`.
- Product features: `feature/<feature-name>` (e.g. `feature/buyer-profile`).
- Process / docs / chores: `docs/<name>` or `chore/<name>`.

## Commit conventions

[Conventional Commits](https://www.conventionalcommits.org), enforced by commitlint:

```
feat(buyer): create buyer profile
fix(documents): checksum validation
refactor(activity): simplify mapper
test(verification): add approval tests
docs(api): update contracts
chore(deps): bump prisma
```

Keep the body under 100 chars per line.

## Before you push (mandatory gate)

Nothing may be pushed if any command fails:

```bash
pnpm install
pnpm prisma generate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Pre-commit hooks (Husky + lint-staged + commitlint) run a subset automatically.

## PR workflow

Open a PR with the template (`.github/pull_request_template.md`) - all sections + the
review checklist. Do **not** merge your own PR; wait for a CODEOWNER review.

## Review process

- At least one approving review from a matching CODEOWNER.
- CI must be green (lint, typecheck, tests, build, security scan).
- Squash-merge to keep a linear history; delete the branch.

## Release process

See [RELEASE.md](./RELEASE.md).
