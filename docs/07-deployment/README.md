# deployment

Index for the `07-deployment` documentation folder (see TRY-BNP-DOCS-01 for scope, audience and update rules).

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
