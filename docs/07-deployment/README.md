# deployment

Index for the `07-deployment` documentation folder (see TRY-BNP-DOCS-01 for scope, audience and update rules).

## The production pipeline

Two systems release production, and they have **separate, non-overlapping
jobs**:

| System                     | Responsibility                                   |
| -------------------------- | ------------------------------------------------ |
| **Vercel Git integration** | Builds and deploys the application. Only Vercel. |
| **GitHub Actions**         | Applies database migrations, then checks health. |

```
push to main
  ├─ GitHub Actions (.github/workflows/deploy.yml)
  │    └─ prisma migrate deploy .... DIRECT_DATABASE_URL, step-scoped
  │       └─ migrate status ........ nothing left pending
  │          └─ wait, then GET https://portal.triyaraexports.com/api/health
  │
  └─ Vercel Git integration  (independent, ~2 min)
       └─ builds this commit with the REAL production environment
          └─ promotes it to portal.triyaraexports.com
```

GitHub Actions **does not deploy the application**, and must not be made to.
The only credential it holds for production is `DIRECT_DATABASE_URL`, scoped to
the migration step.

### Why GitHub Actions no longer deploys

It used to. On **23 August 2026** that took production down.

The workflow ran `vercel pull --environment=production`, then `vercel build
--prod`, then `vercel deploy --prebuilt --prod`. What nobody had noticed is that
**`vercel pull` does not return the values of variables marked _Sensitive_** in
the Vercel project. It writes the literal string `[SENSITIVE]`:

```
DATABASE_URL="[SENSITIVE]"
AUTH_SECRET="[SENSITIVE]"
STORAGE_BUCKET="[SENSITIVE]"
```

The build consumed that file, the prebuilt artefact shipped, and the deployment
came up with an unusable database configuration. `/api/health` answered `503`
with `"database":"unreachable"` until the previous deployment was rolled back.

The preflight step did not catch it because it asserted each variable was
**present**, and `DATABASE_URL="[SENSITIVE]"` is present. The comment in that
step even recorded the assumption that failed — _"the real value is still
available to the deployed application"_ — which is true of a Git-integration
deploy and false of a prebuilt one.

Vercel's own Git integration injects the real values at build and at runtime, so
it never had this problem. The same commit deployed both ways is the clearest
evidence: the Git build took ~2 minutes and was healthy; the prebuilt upload
took 18 seconds and could not reach the database.

**Therefore `vercel pull`, `vercel build` and `vercel deploy --prebuilt` must
never return to this workflow.** A stricter preflight is not the fix; not
building from CI is.

### What must be configured

**GitHub → Settings → Secrets and variables → Actions → Secrets**

| Secret                | Where it comes from                                                 |
| --------------------- | ------------------------------------------------------------------- |
| `DIRECT_DATABASE_URL` | Neon → the **direct** endpoint, i.e. the host **without** `-pooler` |

That is the only secret the release workflow needs. `DIRECT_DATABASE_URL` must
be the direct endpoint: `prisma migrate deploy` takes a session-level advisory
lock, and PgBouncer's transaction pooling cannot hold one, so migrating over the
pooled runtime URL hangs or fails.

`VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are **no longer used by
this workflow** — nothing in CI talks to Vercel any more. They may still exist
for local tooling; the release path does not read them.

There is no `DEPLOY_ENABLED` variable and there must not be one. An off switch
in front of a migration job is how a schema change gets silently skipped while
the code that needs it ships anyway — which is exactly what happened when the
QuoteRequest migration did not run and every public submission answered `500`
for seventeen minutes. The job is safe to run unconditionally: `migrate deploy`
applies only what has not been applied, and does nothing when there is nothing
to do.

**Vercel → Project → Settings → Environment Variables → Production**

| Variable                       | Notes                                                 |
| ------------------------------ | ----------------------------------------------------- |
| `DATABASE_URL`                 | production Postgres, with connection pooling          |
| `AUTH_SECRET`                  | `openssl rand -base64 32` — not the development value |
| `AUTH_TRUST_HOST`              | `true`                                                |
| `PUBLIC_REGISTRATION_ORG_SLUG` | must match a real organization or every signup fails  |
| `STORAGE_PROVIDER`             | `s3` or `r2`; anything else is refused                |
| `STORAGE_BUCKET`               |                                                       |
| `STORAGE_ACCESS_KEY_ID`        |                                                       |
| `STORAGE_SECRET_ACCESS_KEY`    |                                                       |
| `STORAGE_REGION`               | real region for S3; `auto` for R2                     |
| `STORAGE_ENDPOINT`             | R2 only, and required there                           |

These are read by the running application. Nothing in CI reads them, so nothing
in CI can corrupt them.

### Migrations

`prisma migrate deploy` runs in GitHub Actions against the production database,
using `DIRECT_DATABASE_URL`. Three consequences worth understanding:

- The GitHub runner must be able to reach the production database. A managed
  Postgres with IP allowlisting will reject it; allow the runner or move this
  step to a self-hosted runner inside the network.
- Migrations must be **additive** (expand/contract). Add the new shape, ship
  code that writes both, remove the old shape in a later release.
- Additive is not a style preference here — it is what makes the race below
  survivable. A migration that drops or renames a column breaks the property the
  whole arrangement depends on.

### The race we did not close

Vercel's Git integration keeps deploying production on every push to `main`, and
that is now the intended state. It is also independent of GitHub Actions:
**nothing sequences the migration against the deployment.**

In practice the migration wins comfortably. Vercel starts building about two
seconds after the push and takes roughly two minutes; `migrate deploy` takes
about four seconds. But "comfortably" is not "guaranteed", and this is a real
limitation rather than an oversight:

> **A failed migration does not stop Vercel from deploying the code.**

What makes that acceptable is the additive rule. If a migration fails or lands
late, the new code meets a schema that is missing only the _new_ shape, so the
**new feature** returns errors while the rest of the portal keeps serving. That
is precisely what happened on 23 August: `QuoteRequest` had no table yet, so
`POST /api/v1/public/quote-requests` answered `500` and nothing else was
affected.

The options for closing it properly were considered and rejected, and it is
worth knowing why so nobody re-opens them casually:

- **Deploy from CI after migrating.** This is what caused the outage. See above.
- **Disable Vercel production deploys and promote a preview from CI.** Preview
  deployments build with the _Preview_ environment. Only `DATABASE_URL` and
  `AUTH_SECRET` are scoped to Preview in this project; the other fourteen
  variables are Production-only, so a promoted preview would boot without
  storage or email configuration.
- **Gate the Vercel build on migration state via an Ignored Build Step.** That
  command runs inside Vercel's build environment and would need production
  database credentials there, widening the blast radius to solve an ordering
  problem that the additive rule already contains.

### Going live, in order

1. Create the production database and run `prisma migrate deploy` against it
   once, by hand, so the first automated release is not also the first migration.
2. Create the bucket (see Production storage below) and its credentials.
3. Set every Vercel production variable in the table above.
4. Set `DIRECT_DATABASE_URL` as a GitHub secret — the direct Neon endpoint, not
   the pooled one.
5. **Leave production deploys ENABLED in Vercel's Git integration.** Vercel is
   the only deployer. (An earlier version of this document said to disable them,
   because the workflow used to deploy as well. It no longer does, and disabling
   them now would mean nothing deploys at all.)
6. Create the first administrator (see below) — until then nobody can sign in.
7. Work through the post-deploy checks below.

### Releasing a database migration safely

For a future engineer shipping a schema change, in order:

1. Write the migration so it is **additive**. If the change is fundamentally a
   drop or a rename, split it across two releases: add the new shape now, ship
   code that writes both, remove the old shape in a later release once nothing
   reads it.
2. Let CI prove it before merge. `ci.yml` already replays every migration from an
   empty database, fails on schema drift, seeds, and runs the integration tests.
   A migration that cannot replay cleanly never reaches `main`.
3. Merge to `main`. The release workflow applies the migration; Vercel builds and
   deploys the same commit independently.
4. Watch **Actions → Release**. The migration job is authoritative for the
   schema; the health job tells you whether production is serving afterwards.
5. If the health check is red, roll the **deployment** back (below). Do not roll
   the database back.

### The first administrator

Nothing in the running application can create the first administrator. An
invitation needs an administrator to send it, a password reset needs an account
to reset, and `db:seed` creates one whose password is published in this
repository. A fresh production database therefore has nobody who can sign in.

`db:bootstrap-admin` exists for that one moment. It is manual, it is not wired
into startup, build, deploy, CI or `db:seed`, and it runs only when a person
runs it.

```bash
BOOTSTRAP_ADMIN_EMAIL=you@example.com \
BOOTSTRAP_ADMIN_PASSWORD='…' \
DATABASE_URL='…' \
pnpm --filter @triyara/db db:bootstrap-admin -- --confirm
```

Without `--confirm` it prints the host, database, organization and email it
would write to, and exits having changed nothing. Run it that way first:
`DATABASE_URL` is usually whatever a shell last exported, and the dry run is
what stops the wrong database being written to.

| Variable                   | Required | Notes                                                                                     |
| -------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `BOOTSTRAP_ADMIN_EMAIL`    | yes      | Lowercased. Becomes the sign-in address                                                   |
| `BOOTSTRAP_ADMIN_PASSWORD` | yes      | 12+ characters, upper, lower and a digit — the same rule the change-password form applies |
| `BOOTSTRAP_ADMIN_NAME`     | no       | Defaults to `Triyara Administrator`                                                       |
| `BOOTSTRAP_ADMIN_ORG_SLUG` | no       | Defaults to `triyara`. The organization must already exist                                |

**Supply the password through the environment and nowhere else.** It must not
be committed, pasted into a ticket, or written to an env file that outlives the
command. Prefer a shell that does not record history for that line. Neither the
command nor its error messages ever print the password or the hash.

It also creates the four role rows — `ADMIN`, `EXPORTER`, `VERIFIER` and
`READ_ONLY` — if they are absent. Those are names, not grants: only `ADMIN` is
assigned, to this one account. They matter because inviting a colleague resolves
the chosen role by name, so a database missing them produces an administrator
who can sign in and then cannot invite anybody.

Re-running is safe. An account that already exists is left exactly as it was —
no password overwritten, no name changed — so running this again after a
password rotation cannot silently undo it. The two things it will still do are
add the ADMIN role if that link is missing, and fill in any missing role row.

Afterwards:

1. Sign in at `/login` with that address.
2. Remove `BOOTSTRAP_ADMIN_*` from your shell and any local env file.
3. Set `SUPER_ADMIN_EMAILS` in Vercel production explicitly. The code falls back
   to a hardcoded Stage-1 address when it is unset, which works but leaves who
   may approve admin access requests undeclared.

This does not contradict the rule that ADMIN cannot be assigned through the
admin screens. That rule exists so the role is granted only by a Super Admin
approving a request — and it is precisely why a first grant has to happen out of
band, since otherwise there is nobody to approve the first request.

### Post-deploy checks

The automated smoke check proves the deployment serves: `/api/health` returns 200. It is a static route, so it says nothing about the database or storage.
These are the checks that do, and they need a human:

1. Sign in. Failure here usually means `AUTH_SECRET` or `AUTH_TRUST_HOST`.
2. Open the supplier list. Failure means `DATABASE_URL`.
3. Register a test supplier through the public form with a document attached.
   Failure means `PUBLIC_REGISTRATION_ORG_SLUG` or storage credentials.
4. Confirm the document row shows a non-zero size — the size is read back from
   storage, so zero means the object never landed.
5. **Redeploy, then download that document again.** This is the only check that
   distinguishes real object storage from a filesystem that is about to vanish.

### The health check

The second job in the release workflow waits two minutes for Vercel to build and
promote, then polls **`https://portal.triyaraexports.com/api/health`** — the
stable public domain — up to ten times, asserting both `"status":"ok"` and
`"database":"ok"`. Both, because `/api/health` is a readiness check: it answers
`503` with `"degraded"` when the database is unreachable, so a bare status
assertion would pass a deployment that cannot serve.

Three things it deliberately does **not** do:

- **It does not target a raw deployment URL.** Those sit behind Deployment
  Protection and need a token to read, and more importantly they tell you
  whether one deployment answers — not whether the domain users actually hit
  does.
- **It does not gate the release.** By the time it runs, Vercel has already
  promoted the commit on its own schedule. A red check means "production is
  unhealthy, go look".
- **It does not roll back automatically, and must not be made to.** An automatic
  rollback fired by a transient blip is a second outage, not a recovery. It
  performs no mutation of production of any kind.

There is one honest gap: because the domain serves the _previous_ deployment
until Vercel finishes, an early poll can pass against code this workflow never
released. The initial wait makes that unlikely; the check does not claim to
prove which commit is live.

### Rolling back

Roll the **deployment** back, never the database:

```bash
vercel rollback <previous-deployment-url>
```

or in the dashboard, Deployments → the previous production deployment → Promote.

Do **not** roll the database back. Additive migrations are compatible with the
previous release, which is the entire point of the discipline above — it is what
let the 23 August rollback restore service in about two seconds while migration
`0022_quote_request_intake` stayed applied. If a migration itself is the problem,
write a new forward migration.

## Email delivery

Suppliers and buyers have no account and no inbox inside the product. Email is
the only channel that reaches them at all, so a message that is not sent is
indistinguishable — from their side — from never having registered.

### Configuration

| Variable                    | Required           | Notes                                                                                                |
| --------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`            | yes, in production | Resend → API Keys                                                                                    |
| `EMAIL_FROM`                | yes, in production | must be a **verified domain** in Resend                                                              |
| `EMAIL_REPLY_TO`            | recommended        | rejection emails invite a reply; without it nobody reads it                                          |
| `EMAIL_STAFF_NOTIFICATIONS` | recommended        | comma-separated; unset means nobody is told about new registrations                                  |
| `APP_URL`                   | recommended        | absolute origin for links; falls back to `VERCEL_URL`, then localhost                                |
| `SUPER_ADMIN_EMAILS`        | recommended        | who may decide admin access requests; comma-separated, falls back to the Stage-1 super administrator |

Without a key the app uses a **log transport**: messages are written to the log
rather than sent. That is the default locally, which is why a password-reset
link is still usable in development. It is refused when serving production —
the same guard shape storage uses, and exempt during `next build` via
`NEXT_PHASE`.

### Running the production build locally

`next start` sets `NODE_ENV=production` with no `NEXT_PHASE`, so the guard above
fires and the server refuses to start — which is correct for a deployment and
unhelpful when you want to benchmark the production build on a laptop.

Set `EMAIL_TRANSPORT=log` for that, and nothing else:

```bash
EMAIL_TRANSPORT=log pnpm --filter @triyara/web start
```

Do **not** supply placeholder values for `RESEND_API_KEY` and `EMAIL_FROM`
instead. Any non-empty pair selects the Resend transport, so the first message
attempts a real network call with a bogus key — and if the values happen to be
real, a load test sends real email to real people.

`EMAIL_TRANSPORT` is not sufficient on its own. It is ignored whenever
`VERCEL`, `VERCEL_ENV` or `VERCEL_URL` is present, which Vercel sets on every
deployment, preview and production alike. Adding it to the project's
environment therefore cannot disable the guard.

Verify the sending domain in Resend before go-live. An unverified domain does
not fail at startup; it fails per message, and the first person to notice is a
supplier who never got a reply.

### What is sent, and when

Email hangs off the existing domain-event bus as one more best-effort
subscriber, alongside activity ingestion and in-app notifications. Those are
unchanged: every event is still emitted, every in-app notification is still
generated. Nothing is replaced.

| Flow                  | Trigger                             | Recipient                   |
| --------------------- | ----------------------------------- | --------------------------- |
| Supplier confirmation | `supplier.self_registered`          | primary contact             |
| Buyer confirmation    | `buyer.self_registered`             | primary contact             |
| Staff alert           | either registration event           | `EMAIL_STAFF_NOTIFICATIONS` |
| Supplier approved     | `supplier.approved`                 | primary contact             |
| Supplier rejected     | `supplier.rejected`                 | primary contact             |
| Buyer approved        | `buyer.approved`                    | primary contact             |
| Buyer rejected        | `buyer.rejected`                    | primary contact             |
| Password reset        | forgot-password form                | the account address         |
| Staff invite          | _not wired — no invite flow exists_ | invitee                     |

Approval and rejection messages carry the reviewer's most recent comment, so a
rejection says why rather than only no.

### Two behaviours to know about

**A failed email never fails the request.** By the time any of this runs the
registration is already saved. Delivery failures are caught, logged and
dropped: trading a recoverable problem (a missed email, resendable by hand) for
an unrecoverable one (a lost registration) would be the wrong bargain. The same
applies to password reset, where surfacing a delivery error would also reveal
which addresses are registered — the one thing the uniform reply exists to hide.

**Not every supplier can be emailed.** The registration wizards deliberately
accept a contact reachable only by phone or WhatsApp, so `SupplierContact.email`
and `BuyerContact.email` are nullable. Those contacts are skipped and logged as
`email.contact_has_no_address`; the staff alert still fires, so the
registration never disappears from the review queue.

### Delivery log

One structured line per delivery attempt, whatever the outcome:

| Line                                   | Meaning                                      |
| -------------------------------------- | -------------------------------------------- |
| `email.sent`                           | accepted by Resend; includes id and attempts |
| `email.failed`                         | gave up; includes error, attempts, retryable |
| `email.skipped`                        | nothing to send to                           |
| `email.contact_has_no_address`         | contact has no email address                 |
| `email.no_staff_recipients_configured` | `EMAIL_STAFF_NOTIFICATIONS` is unset         |
| `email.not_sent_development`           | log transport; the message was not sent      |

Transient failures (5xx, 429, network) are retried up to three times with
exponential backoff inside an 8-second budget. Permanent ones (a rejected
address, a malformed payload) are not retried — they fail identically every
time, and on 4xx repeated attempts look like abuse. The budget is small on
purpose: the bus awaits its subscribers, so this time is added to the request
that triggered it.

### Verifying after deploy

1. Register a test supplier with a real address you control; the confirmation
   should arrive, and the staff alert should reach `EMAIL_STAFF_NOTIFICATIONS`.
2. Approve it, then reject another; check both messages and that the rejection
   carries the reviewer's comment.
3. Request a password reset and follow the link end to end.
4. Check the logs for `email.sent` lines with the Resend message ids, and
   cross-check those ids in the Resend dashboard for bounces.

Step 4 matters: `email.sent` means Resend _accepted_ the message, not that it
landed in an inbox. Bounces and spam placement are only visible in Resend.

## Production storage

Supplier and buyer documents — certificates, company profiles, factory photos —
are the only user-uploaded data the platform holds. Getting this wrong loses
them silently, so it is configured deliberately rather than by default.

### Why `local` is refused in production

`STORAGE_PROVIDER=local` writes to the container filesystem. On a serverless
host that filesystem is read-only outside `/tmp`, and `/tmp` is discarded
between invocations. An upload either fails with an opaque filesystem error or
appears to succeed and vanishes — and a supplier who uploaded their FSSAI
certificate has no way of knowing which.

The application therefore **refuses to start** when `NODE_ENV=production` and
the provider is not `s3` or `r2`. A deployment that will not boot is
recoverable in minutes. Documents that were never really stored are not.

Builds are exempt: `next build` also runs with `NODE_ENV=production`, so the
guard additionally checks `NEXT_PHASE`. CI builds without cloud credentials
continue to pass.

### Required variables

| Variable                    | S3          | R2       | Notes                                           |
| --------------------------- | ----------- | -------- | ----------------------------------------------- |
| `STORAGE_PROVIDER`          | `s3`        | `r2`     | anything else is refused in production          |
| `STORAGE_BUCKET`            | required    | required |                                                 |
| `STORAGE_ACCESS_KEY_ID`     | required    | required |                                                 |
| `STORAGE_SECRET_ACCESS_KEY` | required    | required |                                                 |
| `STORAGE_REGION`            | real region | `auto`   | defaults to `auto`                              |
| `STORAGE_ENDPOINT`          | omit        | required | `https://<account-id>.r2.cloudflarestorage.com` |

If any of the three required values is missing the app names the missing ones
at startup, rather than failing one upload at a time with an AWS error.

### Bucket setup

The bucket must be **private**. Nothing is served from it directly: uploads go
through a presigned `PUT` valid for 15 minutes, downloads through a presigned
`GET` valid for 5 minutes. A public bucket would make every supplier document
world-readable to anyone who learns a key.

CORS must allow `PUT` from the application origin, or browser uploads fail
while server-side calls appear to work:

```json
[
  {
    "AllowedOrigins": ["https://your-app-domain"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3000
  }
]
```

The credentials need only `GetObject`, `PutObject`, `DeleteObject` and
`HeadObject` on that one bucket. `HeadObject` is not optional — document size
and checksum are read from storage after upload rather than trusted from the
browser, and without it every upload is rejected as missing.

### Verifying a deployment

Configuration mistakes here are silent, so check by doing rather than by
reading. After deploying:

1. Register a test supplier through the public form and attach a document.
2. Confirm the row appears with a non-zero file size — the size is read from
   storage, so a zero or missing size means the object never landed.
3. **Redeploy the application.**
4. Open the document again. If it downloads, storage is external and correct.

Step 3 is the one that matters. Everything else passes just as convincingly
with local storage, right up until the first deploy.

### Operational note

Presigned `PUT` cannot enforce a maximum object size the way the local provider
does — the size ceiling is validated from a value the client states at presign
time. The recorded metadata is always accurate, because it is read back from
storage afterwards; the exposure is storage cost from a client that under-states
its size. A bucket lifecycle rule or size-based alarm is the mitigation, and
there is no application change that would close it.
