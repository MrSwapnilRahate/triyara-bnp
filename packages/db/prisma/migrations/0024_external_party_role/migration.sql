-- ---------------------------------------------------------------------------
-- The EXTERNAL_PARTY role row (TRY-BNP-EXT-PROVISION)
--
-- Migration 0023 added EXTERNAL_PARTY to the RoleName enum. It did not create a
-- Role ROW, and nothing else does either: seed.ts and bootstrap-admin.ts both
-- enumerate the four internal roles, so a database that has been migrated and
-- seeded holds ADMIN, EXPORT_MANAGER, VERIFIER and READ_ONLY and nothing more.
--
-- That gap is not cosmetic. `userRepository.createWithInvite` resolves the role
-- by name and throws when the row is absent, so provisioning an external login
-- would fail with "Role EXTERNAL_PARTY does not exist" - at runtime, on a value
-- the type system says is valid.
--
-- The catalogues are updated alongside this, which covers every database created
-- from now on. This migration is what covers the ones that already exist,
-- production included, where bootstrap has already run and will not run again.
--
-- The first data migration in this repository. Every other one is DDL, and that
-- is worth preserving as the norm: reference rows belong in the seed unless an
-- existing database needs them, which is exactly the case here.
-- ---------------------------------------------------------------------------

-- `id` is supplied explicitly because Role.id has no database default. Prisma's
-- `@default(cuid())` is generated in the client, so the column is a bare
-- `TEXT NOT NULL` (0000_init) and raw SQL has to provide one. `gen_random_uuid`
-- is core in PostgreSQL 13+, so this needs no extension; the value is opaque and
-- never compared against the cuids the client writes.
--
-- ON CONFLICT on "name" - the unique index is Role_name_key - rather than on the
-- primary key, because the row that might already be here would have arrived
-- from the seed with a different id and the same name. DO NOTHING leaves it
-- exactly as it is, so re-running this migration, or running it against a
-- database the updated seed has already touched, changes nothing.
INSERT INTO "Role" ("id", "name")
VALUES (gen_random_uuid()::text, 'EXTERNAL_PARTY')
ON CONFLICT ("name") DO NOTHING;
