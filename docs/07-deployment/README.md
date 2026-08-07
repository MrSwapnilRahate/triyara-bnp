# deployment

Index for the `07-deployment` documentation folder (see TRY-BNP-DOCS-01 for scope, audience and update rules).

## The production pipeline

`.github/workflows/deploy.yml` runs on every push to `main`. It pulls the
production configuration from Vercel, refuses to continue if any required
variable is absent, applies database migrations, builds, deploys, and checks
that the deployment answers.

```
push to main
  └─ vercel pull ............ project settings + production env
     └─ preflight ........... required variables present, provider is s3/r2
        └─ migrate deploy ... schema first, so code never leads the database
           └─ vercel build
              └─ vercel deploy --prod
                 └─ GET /api/health must return 200
```

Configuration lives in **Vercel**, not in GitHub. The only things GitHub holds
are the three values needed to reach Vercel. That way there is one place to
change a database URL or rotate a storage key, and no chance of the two
drifting apart.

### The deploy is off until you turn it on

The job is gated on `vars.DEPLOY_ENABLED == 'true'`. Until that repository
variable exists, merging to `main` deploys nothing — which is the correct
state while secrets are still missing, and is why merging the pipeline itself
is safe. Setting it to `true` is the go-live action.

### What must be configured

**GitHub → Settings → Secrets and variables → Actions → Secrets**

| Secret              | Where it comes from                                         |
| ------------------- | ----------------------------------------------------------- |
| `VERCEL_TOKEN`      | Vercel → Account Settings → Tokens                          |
| `VERCEL_ORG_ID`     | `.vercel/project.json` after `vercel link`, or project page |
| `VERCEL_PROJECT_ID` | same                                                        |

**GitHub → … → Variables**

| Variable         | Value                          |
| ---------------- | ------------------------------ |
| `DEPLOY_ENABLED` | `true` — set this one **last** |

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

The preflight step asserts the presence of all of these except
`AUTH_TRUST_HOST`, `STORAGE_REGION` and `STORAGE_ENDPOINT` (the last is
required only when the provider is `r2`). It reads names, never values.

### Migrations

`prisma migrate deploy` runs **before** the deploy, against the production
database, using the `DATABASE_URL` pulled from Vercel. Two consequences worth
understanding:

- The GitHub runner must be able to reach the production database. A managed
  Postgres with IP allowlisting will reject it; allow the runner or move this
  step to a self-hosted runner inside the network.
- Migrations must be **additive** (expand/contract). If a deploy fails after a
  successful migration, the previous code keeps serving against a schema that
  has gained columns — harmless. A migration that drops or renames instead
  takes production down at exactly that moment. Add the new shape, ship code
  that writes both, remove the old shape in a later release.

### Avoiding a double deploy

Vercel's own Git integration builds preview deployments per pull request, which
is wanted. If that integration is _also_ set to deploy production on pushes to
`main`, every merge deploys twice — once by Vercel directly, once by this
workflow, and the one that lands last wins with no ordering guarantee against
the migration step.

Turn production deploys off on Vercel's side (Project → Settings → Git →
Production Branch / Ignored Build Step), keeping previews on. This repository
does not ship a `vercel.json`, because in a monorepo Vercel reads it from the
project's configured Root Directory and putting it in the wrong place silently
does nothing — the dashboard setting is unambiguous.

### Going live, in order

1. Create the production database and run `prisma migrate deploy` against it
   once, by hand, so the first automated deploy is not also the first migration.
2. Create the bucket (see Production storage below) and its credentials.
3. Set every Vercel production variable in the table above.
4. Set `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` as GitHub secrets.
5. Disable production deploys in Vercel's Git integration.
6. Set `DEPLOY_ENABLED=true`.
7. Trigger **Actions → Deploy → Run workflow** rather than waiting for a merge,
   so the first production deploy is one you are watching.
8. Work through the post-deploy checks below.

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

### Rolling back

Roll the deployment back in Vercel (Deployments → the previous production
deployment → Promote). Do **not** roll the database back; additive migrations
are compatible with the previous release, which is the point of the discipline
above. If a migration itself is the problem, write a new forward migration.

## Email delivery

Suppliers and buyers have no account and no inbox inside the product. Email is
the only channel that reaches them at all, so a message that is not sent is
indistinguishable — from their side — from never having registered.

### Configuration

| Variable                    | Required           | Notes                                                                 |
| --------------------------- | ------------------ | --------------------------------------------------------------------- |
| `RESEND_API_KEY`            | yes, in production | Resend → API Keys                                                     |
| `EMAIL_FROM`                | yes, in production | must be a **verified domain** in Resend                               |
| `EMAIL_REPLY_TO`            | recommended        | rejection emails invite a reply; without it nobody reads it           |
| `EMAIL_STAFF_NOTIFICATIONS` | recommended        | comma-separated; unset means nobody is told about new registrations   |
| `APP_URL`                   | recommended        | absolute origin for links; falls back to `VERCEL_URL`, then localhost |

Without a key the app uses a **log transport**: messages are written to the log
rather than sent. That is the default locally, which is why a password-reset
link is still usable in development. It is refused when serving production —
the same guard shape storage uses, and exempt during `next build` via
`NEXT_PHASE`.

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
