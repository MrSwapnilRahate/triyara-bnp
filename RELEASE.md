# Release Process

## Semantic Versioning

Releases follow [SemVer](https://semver.org): `vMAJOR.MINOR.PATCH`.

- **MAJOR** - breaking API/DB/contract changes.
- **MINOR** - new, backward-compatible features (most module phases).
- **PATCH** - backward-compatible fixes.

Phase tags use a descriptive suffix, e.g. `v0.5.0-verification`, `v0.6.0-activity`.

## CHANGELOG policy

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com). Every user-facing
change adds an entry under the target version, grouped **Added / Changed / Deprecated /
Removed / Fixed / Security**. Deprecations are announced with a `Sunset` date before
removal. The `[Unreleased]` section accumulates until a release cuts it over.

## Release steps

1. Ensure `main` is green (full gate) and the CHANGELOG `[Unreleased]` section is ready.
2. Bump the version, move `[Unreleased]` to the new version with the date.
3. Tag: `git tag -a vX.Y.Z -m "..."`.
4. Push the tag; create a **GitHub Release** from it with the CHANGELOG section as notes.
5. Deploy (CI/CD promotes on merge to `main`; migrations run backward-compatible first).

## Rollback strategy

- **App:** re-promote the previous deployment (one click / CLI), or `git revert` the merge
  commit and let CI redeploy.
- **Data:** migrations are expand-then-contract, so a rollback never strands the schema;
  a prior release runs against the newer schema.
- **Release:** mark the GitHub Release as superseded; document the incident in
  `docs/06-operations`.
