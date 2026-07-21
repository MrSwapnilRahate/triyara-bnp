# Triyara Business Network Platform

[![CI](https://img.shields.io/badge/CI-github__actions-2f6d9c)](./.github/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D20-2f8055)](./.nvmrc)
[![pnpm](https://img.shields.io/badge/pnpm-10-f69220)](https://pnpm.io)
[![License](https://img.shields.io/badge/license-UNLICENSED-6b7688)](#license)

Internal business-network platform for **Triyara Exports LLP** — one structured system of
record for suppliers and buyers. This repository is the production-grade **scaffold**
(`TRY-BNP-BOOT-01`); business modules arrive in later phases.

## Overview

- **What** — internal directory + CRM for export partners (not a marketplace).
- **Who** — Triyara export managers, verifiers and admins.
- **Problem it solves** — replaces email / WhatsApp / PDF / Excel sprawl (see `docs/02-product`).

## Tech stack

| Layer      | Choice               | Rationale                                 |
| ---------- | -------------------- | ----------------------------------------- |
| Framework  | Next.js (App Router) | Public SEO pages + admin app + API in one |
| Language   | TypeScript (strict)  | Shared types end-to-end                   |
| Monorepo   | pnpm + Turborepo     | One deploy, clear package boundaries      |
| Styling    | Tailwind CSS         | Shared preset in `@triyara/config`        |
| Validation | Zod                  | One schema, client + server               |
| Logging    | Pino                 | Structured JSON                           |

Full rationale: **`docs/03-engineering` (TRY-BNP-TDR-01)**.

## Documentation

The full specification suite (architecture, PRD, UX, TDR, DB model, API, dev guide) lives in
[`docs/`](./docs) and is indexed by **TRY-BNP-DOCS-01**.

## Development setup

```bash
# prerequisites: Node 20 LTS (see .nvmrc), pnpm 10, Git
pnpm install
cp .env.example .env
pnpm dev            # http://localhost:3000  (health: /api/health)
```

## Folder structure

```
apps/web         Next.js app (public + admin + /api/v1)
packages/config  shared Tailwind preset
packages/lib     logger, errors, Result, env validation
packages/ui      design-system components
packages/validation  Zod schemas / DTOs
packages/core    domain services (business rules)
packages/db      Prisma client + repositories
packages/auth    Auth.js + RBAC
packages/events  domain-event contracts
docs/            documentation portal (TRY-BNP-DOCS-01)
tooling/ scripts/ .github/ .vscode/   repo automation
```

Dependency direction is inward only (`app → core → db`); enforced by ESLint (TRY-BNP-DEV-01).

## Scripts

| Command          | Does                                |
| ---------------- | ----------------------------------- |
| `pnpm dev`       | Run the app                         |
| `pnpm lint`      | ESLint (flat config)                |
| `pnpm typecheck` | `tsc --noEmit` across the workspace |
| `pnpm test`      | Vitest                              |
| `pnpm test:e2e`  | Playwright                          |
| `pnpm build`     | Turbo build                         |
| `pnpm format`    | Prettier write                      |
| `pnpm changeset` | Record a versioned change           |

## Roadmap

Phased per the specification suite: scaffold (this) → auth & RBAC → partner registration →
admin dashboard → verification → search. See `docs/00-overview`.

## Contributing

Trunk-based flow, Conventional Commits, squash-merge, green CI required. See
`docs/05-development` and the PR template. Pre-commit hooks run lint-staged + commitlint.

## License

UNLICENSED — © Triyara Exports LLP. All rights reserved.

## Contact

Platform team — see `.github/CODEOWNERS`.
