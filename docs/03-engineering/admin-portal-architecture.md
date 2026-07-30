# Admin Portal — Frontend Architecture

**TRY-BNP-PORTAL-01** · Design only. No implementation.
Target: production admin portal for an export ERP, built entirely on the merged REST APIs.

---

## 0. What this design is built on (verified, not assumed)

Everything below is grounded in the repository at `main`. Four findings change the shape of
the design, so they lead rather than hide in an appendix.

| #      | Finding                                                                                                                                                                                                                                                                                    | Consequence                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **F1** | **`@triyara/ui` contains one function — `cn()`.** There is no design system, no primitives, no tokens beyond a few Tailwind colours (`navy-deep`, `gold`).                                                                                                                                 | §26 is _build a design system_, not _integrate one_. This is the critical path for every screen.                   |
| **F2** | **`apps/web` has no data-fetching, form, or table library.** Dependencies are `next`, `next-auth`, `react`, `zod` and workspace packages. Existing pages are React Server Components calling services directly.                                                                            | §17–19 are net-new dependency decisions. The portal introduces a client-side data layer that does not exist today. |
| **F3** | **`EXPORT_MANAGER` cannot create or edit products.** The CASL matrix grants it create/update on `Account`, `SupplierProfile`, `BuyerProfile`, `Contact`, `Address`, `Document`, `Note`, `Activity` — **`ReferenceData` is absent**, and the entire catalog is governed by `ReferenceData`. | §6 documents this. It is a genuine product tension, not a bug to route around in the UI. Flagged for a decision.   |
| **F4** | **No role except ADMIN has `delete` on anything.** `EXPORT_MANAGER` has create/update only.                                                                                                                                                                                                | Every destructive control in the portal is ADMIN-only. Simplifies §6 and the table row-action design.              |

Two further facts:

- **The current shell is a marketing-styled dark layout** — centred `max-w-6xl`, navy/gold, a
  top nav of four links. It is not an ERP chrome. §3 addresses coexistence.
- **The APIs have known gaps** (§30 defers screens that depend on them): no supplier-invitation
  endpoint on RFQ, no revise / replace-items / set-conditions endpoint on Quotation, and no
  service surface at all for quotation sourcing options.

---

## 1. Application architecture

**One Next.js application, not a separate SPA.** The API routes and the portal already share a
deployment, an auth session, and the `@triyara/validation` schemas. Splitting them would mean
re-implementing session handling and duplicating every DTO type for no benefit.

Four layers, strictly separated:

```
  Route segment (server)     auth gate, params, metadata, streaming boundaries
        │                    never fetches business data itself
        ▼
  View component (client)    composition, layout, empty/error/loading states
        │                    no fetch calls, no cache keys
        ▼
  Feature hook (client)      useQuery/useMutation, cache keys, optimistic concurrency
        │                    the ONLY place an endpoint URL appears
        ▼
  API client (isomorphic)    envelope unwrapping, ETag capture, error normalisation
```

**Rendering strategy.** Server Components own the shell, navigation, and the authorization
context. Every data-bearing screen is a Client Component, because the portal is a
long-lived working surface: filters, sort, pagination cursors and optimistic-concurrency
retries all live in client state. Server-rendering a list that the user will immediately
re-filter buys nothing and costs a round trip.

The exception is **detail-page first paint**: the route segment may prefetch the detail query
on the server and hydrate the client cache, so a deep link renders content rather than a
spinner. This is an optimisation applied per screen, not a blanket rule (§28).

**The portal never imports `@triyara/core` or `@triyara/db`.** It talks HTTP. This is the
single most important boundary in the design: it means the portal exercises the same contract
external integrators will, and a bug in authorization or org isolation cannot be papered over
by calling a service directly. The existing server-component pages that _do_ import services
are legacy and are migrated in §30.

**Type flow.** DTO and enum types come from `@triyara/validation` (`CreateRfqDto`,
`RFQ_STATUSES`, …). Response shapes are declared in the portal's own `types/` layer, derived
from the published OpenAPI documents. The portal does not import Prisma types.

---

## 2. Route tree

```
/                                    → redirect: authed → /dashboard, else → /login

(auth)                               unauthenticated shell
  /login
  /forgot-password
  /reset-password

(app)                                authenticated shell
  /dashboard                         role-aware landing

  /catalog
    /products                        list
    /products/new
    /products/:id                    tabs: overview · specs · media · documents · pricing · suppliers
    /categories                      tree editor
    /specifications                  definition registry
    /tags

  /suppliers
    /                                list
    /new
    /:id                             tabs: overview · contacts · addresses · certifications ·
                                           offerings · banking · performance · approvals
    /:id/products                    offerings, deep-linkable

  /rfqs
    /                                list
    /new
    /:id                             tabs: overview · lines · suppliers · responses · comparison ·
                                           approvals · revisions
    /:id/compare                     full-screen bid comparison

  /quotations
    /                                list
    /new
    /:id                             tabs: overview · lines · pricing · sourcing · approvals · revisions
    /:id/revisions/:revisionId       a pinned historical revision (read-only)

  /accounts                          EXISTING — buyers and counterparties
    /:id                             tabs: overview · buyer · supplier · activity · documents

  /verifications                     EXISTING
  /documents                         EXISTING
  /activity                          EXISTING
  /notifications                     EXISTING

  /admin                             ADMIN-gated segment
    /users
    /users/:id
    /roles
    /sessions
    /login-attempts
    /organization
    /organization/payment-terms
    /organization/exchange-rates
    /audit
    /api-docs                        renders the four openapi.json documents

  /search                            global search results
```

**Route conventions**

- **Detail tabs are route segments, not local state.** `/rfqs/:id/responses` must be
  linkable, bookmarkable, and survivable across a refresh — an approver sends a colleague a
  link to the responses tab, not to "the RFQ, then click the third tab".
- **List state lives in the query string** (`?status=SENT&sort=-grandTotal&cursor=…`). Same
  reason. It also makes the back button behave.
- **`:id` on a quotation is a revision id, not a quotation number.** The URL surfaces this
  through `/quotations/:id/revisions/:revisionId` for pinned history. The list defaults to
  `currentOnly=true` so users see documents, not a revision archive.

---

## 3. Layout hierarchy

```
RootLayout                    html, fonts, providers, theme
 └─ QueryProvider             React Query client + devtools (dev only)
    └─ AbilityProvider        CASL ability built from the session, read-only
       └─ ToastRegion         aria-live, single instance
          ├─ (auth)/layout    centred card, no chrome
          └─ (app)/layout     AppShell
                ├─ Sidebar            primary nav, collapsible, persistent
                ├─ TopBar             breadcrumb · global search · notifications · user menu
                ├─ <main>             page content
                │    └─ PageHeader    title · status · metadata · primary actions
                │    └─ PageBody      the screen
                └─ DetailDrawer       optional right-hand panel, route-driven
```

**The shell changes.** The current top-nav layout suits five destinations; the portal has
roughly thirty. A **persistent left sidebar** is the right structure for an ERP: it keeps the
module you are in visible, supports grouping, and leaves the top bar for context (breadcrumb,
search, alerts).

**Coexistence, not a rewrite.** The `(app)` layout is replaced by `AppShell`; the existing
pages inside it — accounts, verifications, documents, activity, notifications — keep working
unchanged because they only render into `{children}`. They are restyled onto the design system
incrementally in §30 Wave 5, not blocked on it.

**Density.** Two modes, persisted per user in `localStorage`: _comfortable_ (default) and
_compact_ (denser table rows, smaller controls). Export operations staff live in tables all
day; the difference between 8 and 14 visible rows is a real productivity difference.

---

## 4. Navigation

```
  Dashboard

  SOURCING
    RFQs                    badge: awaiting my approval
    Quotations              badge: awaiting my approval
    Suppliers

  CATALOG
    Products
    Categories
    Specifications
    Tags

  RELATIONSHIPS
    Accounts
    Verifications           badge: assigned to me
    Documents

  ACTIVITY
    Activity feed
    Notifications           badge: unread

  ADMINISTRATION           (ADMIN only)
    Users · Roles · Sessions
    Organization
    Audit log
    API docs
```

**Rules**

- **Items the user cannot use are hidden, not disabled.** A `READ_ONLY` user seeing a greyed
  "Administration" group learns only that something exists they cannot have. Hiding is also
  honest: the API would 403 them anyway.
- **Badges are counts the user must act on**, not totals. "12 RFQs" is noise; "3 awaiting your
  approval" is a work queue. Counts come from dedicated filtered list calls with `limit=1`,
  read from `meta`, polled on the same interval as notifications (§21).
- **Breadcrumbs derive from the route**, with the entity's business identifier resolved from
  the detail cache: `RFQs / RFQ-2026-000001 / Responses`. Never `RFQs / clx7f… / Responses`.
- **Keyboard**: `⌘K` command palette (§15), `g` then `r`/`q`/`s`/`p` to jump to the four main
  modules, `?` for the shortcut sheet.

---

## 5. Authentication flow

Auth.js v5 with credentials and JWT sessions is **already built and frozen**. The portal
consumes it; it does not redesign it.

```
  unauthenticated request to /(app)/*
        │
        ▼
  middleware → no session cookie → 302 /login?next=<original path>
        │
  login form → server action → Auth.js signIn
        │           ├─ invalid      → field-level error, no enumeration hint
        │           ├─ rate limited → 429, cooldown message with remaining time
        │           └─ success      → session cookie set, 302 to `next` or /dashboard
        ▼
  (app) layout → requireAuth() server-side → AuthContext { user, organizationId, ability }
        │        serialised into AbilityProvider for client components
        ▼
  every client fetch → cookie sent automatically → API re-derives the context server-side
```

**Session expiry.** A 401 from any API call is a terminal condition for the current view: the
API client raises `UnauthenticatedError`, a top-level boundary clears the React Query cache
(it holds another tenant's data once the session changes) and redirects to
`/login?next=<current>`. Cache clearing on identity change is a security requirement, not
housekeeping.

**Client-side authorization is advisory.** The ability object shapes the UI. The API is the
enforcement point, and every screen must behave correctly if a 403 arrives anyway — which it
will, for the threshold-gated quotation approvals (§11) that no client-side check can predict.

**Not in scope for the portal**: password reset token mechanics, email verification, session
revocation semantics. These exist in `/api/v1/auth/*` and are surfaced as admin screens (§12).

---

## 6. Authorization matrix

Derived from `packages/auth/src/abilities.ts` as it exists today.

| Subject                                            | ADMIN | EXPORT_MANAGER | VERIFIER | READ_ONLY |
| -------------------------------------------------- | ----- | -------------- | -------- | --------- |
| `all` (read)                                       | ✔     | ✔              | ✔        | ✔         |
| `Account` create/update                            | ✔     | ✔              | —        | —         |
| `SupplierProfile` create/update                    | ✔     | ✔              | —        | —         |
| `BuyerProfile`, `Contact`, `Address` create/update | ✔     | ✔              | —        | —         |
| `Document`, `Note`, `Activity` create              | ✔     | ✔              | ✔        | —         |
| `Verification` verify/update                       | ✔     | —              | ✔        | —         |
| **`ReferenceData` create/update**                  | ✔     | **—**          | —        | —         |
| **`delete` (any subject)**                         | ✔     | **—**          | —        | —         |
| `User`, `Organization` manage                      | ✔     | —              | —        | —         |

**Mapped to modules** (each module's governing subject is fixed in its service):

| Module          | Subject           | Who can write                                       |
| --------------- | ----------------- | --------------------------------------------------- |
| Product catalog | `ReferenceData`   | **ADMIN only**                                      |
| Suppliers       | `SupplierProfile` | ADMIN, EXPORT_MANAGER                               |
| RFQs            | `Account`         | ADMIN, EXPORT_MANAGER                               |
| Quotations      | `Account`         | ADMIN, EXPORT_MANAGER (+ ADMIN for gated approvals) |
| Verifications   | `Verification`    | ADMIN, VERIFIER                                     |

### Two findings that need a decision, not a workaround

**F3 — an export manager cannot add a product.** They can raise an RFQ for a product, source
it, quote it and win it, but cannot create the catalog entry it hangs off. In an export
business the catalog is operational data, not reference data, and this will surface on day one
as "why do I need an admin to add a new grade of turmeric?" The portal cannot fix this — the
grant lives in the frozen ability matrix. **Recommendation: grant `EXPORT_MANAGER`
create/update on `ReferenceData`,** as a separate, reviewed change to `abilities.ts` before
the catalog screens ship. Until then the product create/edit UI is ADMIN-only and the design
assumes that.

**F4 — quotation approval has a second, invisible gate.** `manage Account` is additionally
required to approve a quotation at or above the value threshold or below the margin floor.
Neither the ability object nor the client can evaluate this, because the margin is redacted
from non-ADMIN callers — the client literally cannot see the number the gate is applied to.
The Approve button is therefore **shown** to EXPORT_MANAGER and the 403 is handled as a
first-class outcome (§11), not an error state.

**Cost and margin redaction.** `costTotal`, `marginPercent` and per-line `unitCost` arrive as
`null` for non-ADMIN. The UI renders a locked affordance ("Visible to administrators"), never
`—` or `0`. A zero margin and a hidden margin must never look alike on a pricing screen.

---

## 7. Dashboard architecture

The dashboard answers one question: **what needs me today?** It is a work queue, not a BI
surface. The APIs expose no aggregate endpoints, and inventing client-side roll-ups over
paginated lists would be both slow and wrong.

**Composition — a grid of independent, independently-loading cards.** Each owns its query, its
skeleton and its error state; one failing card does not blank the page.

| Card                     | Source                                                                          | Roles                 |
| ------------------------ | ------------------------------------------------------------------------------- | --------------------- |
| My approvals             | `/api/rfqs?status=PENDING_APPROVAL` + `/api/quotations?status=PENDING_APPROVAL` | ADMIN, EXPORT_MANAGER |
| Quotations expiring soon | `/api/quotations?status=SENT&validBefore=<+7d>&currentOnly=true`                | all                   |
| RFQs closing soon        | `/api/rfqs?status=ISSUED&deadlineBefore=<+7d>`                                  | all                   |
| Awaiting supplier bids   | `/api/rfqs?status=IN_PROGRESS`                                                  | all                   |
| Verification queue       | `/api/v1/verifications?assignedTo=me`                                           | VERIFIER, ADMIN       |
| Certifications lapsing   | `/api/suppliers/certifications` + supplier detail                               | ADMIN, EXPORT_MANAGER |
| Recent activity          | `/api/v1/activities?limit=10`                                                   | all                   |
| Catalog snapshot         | `/api/suppliers/countries`, `/api/catalog/products?limit=1` (count from `meta`) | all                   |

**Counts come from `meta`, not from `data.length`.** Requesting `limit=1` and reading the
pagination metadata is one cheap round trip; fetching 100 rows to call `.length` is not.

**Role-aware by composition.** The card registry is filtered by ability before render — the
dashboard is a different page for a VERIFIER than for an EXPORT_MANAGER, not the same page
with holes.

**Deferred:** trend charts, revenue roll-ups, conversion funnels. These need aggregate
endpoints that do not exist. Building them client-side over cursor-paginated lists would be a
performance trap and would silently truncate at the page boundary.

---

## 8. Product management screens

**`/catalog/products` — list.** Server-driven table: `q`, `categoryId`, `categoryPathPrefix`,
`status`, `brand`, `countryOfOrigin`, `hsCode`, `tagId`; sortable; cursor-paginated. Columns:
SKU · Name · Category · Status · Origin · HS code · Updated. Row click → detail. Bulk
selection is **not** offered — no bulk endpoint exists, and simulating one with N sequential
requests is a failure mode (partial completion with no transaction), not a feature.

**`/catalog/products/:id` — tabbed detail.**

| Tab            | Content                                           | Notes                                                                                                           |
| -------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Overview       | Identity, category, status, origin, HS code, tags | Status change is an explicit control, not a dropdown that saves on blur                                         |
| Specifications | EAV values against the definition registry        | Field type is driven by the definition's `DataType` — number, boolean, date and text render as different inputs |
| Media          | Images, one PRIMARY enforced by the API           | Upload via §22                                                                                                  |
| Documents      | Compliance certificates by `ProductDocumentType`  |                                                                                                                 |
| Pricing        | Price rows by incoterm and validity window        | The API rejects overlapping windows with a 409 — surfaced as a field error on the date range, not a toast       |
| Suppliers      | Offerings, read-only here                         | Deep-links to `/suppliers/:id/products`                                                                         |

**Categories** is a tree editor over the adjacency-list + materialised-path model. Drag-to-
reparent issues a single PATCH; the API recomputes `path`/`depth` for the subtree. Optimistic
update is **not** used here — a mis-parented subtree is expensive to reason about, so the tree
shows a pending state and reconciles on the server's answer.

**Specifications** and **Tags** are thin registry tables (name, data type, unit, usage count).

---

## 9. Supplier management screens

**`/suppliers` — list.** Filters mirror the API exactly: `q`, `status`, `businessType`,
`country`, `city`, `isVerified`, `productId`, `tagId`, plus the GST/IEC/PAN lookups. The
country filter is populated from **`/api/suppliers/countries`** — the tenant's actual
countries with counts, not a 249-entry ISO list. Same for certification filtering via
`/api/suppliers/certifications`, whose `meta.vocabulary` supplies the unheld types so the
filter can show them as empty options.

**Supplier picker.** Everywhere a supplier must be chosen — RFQ invitations, quotation
sourcing — the picker is backed by **`/api/suppliers/search`**, debounced at 250 ms, minimum
2 characters. It returns a compact projection with no contact or banking data, which is
exactly right for a picker. Known limitation carried from the API: ranking is page-local, so
an exact code match outside the first `limit` rows will not surface. The picker mitigates by
capping `limit` at 25 and showing "refine your search" when the result set is full.

**`/suppliers/:id` — tabbed detail.** Overview · Contacts · Addresses · Certifications ·
Offerings · Banking · Performance · Approvals.

- **Banking never shows an account number.** The API's projection omits it; the UI shows bank
  name, IFSC/SWIFT and holder, with an explicit "Account number is not retrievable" note so
  the absence reads as a deliberate control rather than missing data.
- **Certifications** highlight expiry: expired in the error tone, lapsing within 30 days in
  the warning tone. This is the same data the dashboard card surfaces.
- **Offerings** is the write surface for `POST /api/suppliers/:id/products`. The API rejects a
  price without a currency and an inverted validity window — both map to field errors.
- **Approvals** is a read-only timeline of the onboarding workflow.

**Deferred:** editing and removing an individual offering. `supplierOfferingService` exposes
`update` and `remove`, but no endpoints were requested for them, so the UI is add-and-view
only until they exist. Stated rather than faked.

---

## 10. RFQ workflow screens

The RFQ lifecycle is the portal's most stateful surface. The design principle: **the UI never
decides what is legal — it renders what the server says is legal, and reports refusals
faithfully.**

```
DRAFT → PENDING_APPROVAL → APPROVED → ISSUED → IN_PROGRESS → EVALUATING → AWARDED → CLOSED
                                                                    ↘ CANCELLED / EXPIRED ↗
```

**`/rfqs/:id` — a status-driven action bar.** The header renders the status prominently and
offers only the transitions legal from it. A 409 carries the server's message naming the legal
states; that message is shown verbatim, because it is more accurate than anything the client
could reconstruct.

| Tab                   | Content                                                                                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview              | Identity, buyer, terms, deadline, priority. **Terms lock visibly once ISSUED** — currency, incoterm, deadline and destination port become read-only with an explanatory note, matching the API's 409 |
| Lines                 | The line set. Editing opens the **replace** flow (below)                                                                                                                                             |
| Suppliers             | Invited suppliers and participation state — **read-only, see gap**                                                                                                                                   |
| Responses             | Bids, cheapest first, `currentOnly` toggle to reveal superseded revisions                                                                                                                            |
| Comparison            | `/rfqs/:id/compare` — full-screen matrix                                                                                                                                                             |
| Approvals · Revisions | Read-only timelines                                                                                                                                                                                  |

**The line-replacement flow is the screen most likely to be got wrong.** `POST /:id/items`
_replaces_ the entire set and cuts a revision. A UI that presents "Add line" and silently
posts the whole array would be lying about what it does. Instead: an explicit **"Revise
lines"** mode that loads the current set into an editable grid, shows a diff summary before
submitting, and requires a reason. The button says _Revise lines (creates revision N+1)_.

**Bid comparison** is a matrix — lines down, suppliers across, cheapest per line highlighted —
with lead time, MOQ and incoterm inline, because price alone does not decide sourcing. Lateness
is stamped by the server at submission; the UI renders the flag, never recomputes it from the
deadline.

**Gap that blocks a workflow:** there is **no supplier-invitation endpoint**. `invite` and
`setParticipation` exist on the service but are unexposed, and `publish` refuses an RFQ with no
invited suppliers. A user therefore cannot take an RFQ from draft to issued through the portal
alone. The Suppliers tab is read-only and the Publish button carries an explanatory disabled
state until the endpoint lands. §30 sequences the endpoint before the RFQ screens.

---

## 11. Quotation workflow screens

```
DRAFT → PENDING_APPROVAL → APPROVED → SENT → UNDER_NEGOTIATION → ACCEPTED / REJECTED / EXPIRED
                                                                          ↘ WITHDRAWN
   (SUPERSEDED is reached only by revising)
```

**Revisions are the organising concept.** A quotation number has many revisions; each is a row
with its own id. The detail header shows `QT-2026-0001 · Revision 3 of 3 · SENT`, with a
revision switcher. Superseded revisions render **read-only with a persistent banner** —
there is no ambiguity about whether you are looking at the live document.

**Pricing is displayed, never recomputed.** Totals are stored by the server. The pricing tab
shows the ordered condition chain — line subtotals, then charges in `sequence`, then taxes —
so a user can see _how_ the number was reached, but every figure comes from the response. A
client-side recomputation that disagreed with the server by one rounding step on a sent
commercial document would be worse than no breakdown at all.

Two things the pricing tab must render correctly because they look wrong otherwise:

- **Reverse-charge tax** shows its computed amount alongside "not collected — liability with
  the buyer". Otherwise a 19% VAT line that adds nothing to the total looks like a bug.
- **Discounts** are charges with `isDeduction`, shown as negative in the chain and summarised
  separately in `discountTotal`.

**The Approve button and the invisible gate.** For EXPORT_MANAGER the button is shown and may
return **403**. That is a designed outcome: the dialog resolves to _"This quotation needs
administrator approval — it is above the value threshold or below the margin floor."_ with a
"Request administrator review" action, not a red error toast. The client cannot pre-empt this
(§6), so the failure path is the primary path for that role.

**Cost and margin** follow §6: locked affordance for non-ADMIN, on both the header roll-up and
every line.

**Gaps that constrain the screens:** `revise()`, `replaceItems()` and `setConditions()` are
unexposed. A SENT quotation therefore cannot be corrected through the portal at all — `PATCH`
correctly returns 409 and there is no revise endpoint to offer instead. Lines and pricing
conditions can only be set at creation. §30 sequences these endpoints **before** the quotation
screens, because without them the module is read-mostly.

---

## 12. User administration

`/admin/*`, ADMIN only, backed by the merged Auth Extension API.

| Screen         | Endpoint                              | Content                                                                                                                     |
| -------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Users          | `/api/v1/accounts` + role assignments | List, status, roles, last sign-in                                                                                           |
| User detail    | `/api/v1/auth/role-assignments`       | Role grant/revoke, session list, recent login attempts                                                                      |
| Roles          | `/api/v1/auth/permissions`            | **Read-only.** CASL lives in code by an approved decision (ADR-0011); this screen documents the matrix, it does not edit it |
| Sessions       | `/api/v1/auth/sessions`               | Active sessions, revoke individually                                                                                        |
| Login attempts | `/api/v1/auth/login-attempts`         | Security review: failures by user and IP, lockout state                                                                     |

**Role editing is deliberately absent.** Presenting an editable permission grid over a matrix
that is compiled into the application would be a lie. The screen renders §6's table from the
same source constants and states plainly that changes are a code change.

**Self-protection.** An admin cannot revoke their own last ADMIN role or delete their own
account from the UI. The API may or may not enforce this; the UI does not offer it either way,
and if the API allows it the gap is worth closing server-side.

---

## 13. Organization settings

| Screen         | Endpoint                 | Notes                                                    |
| -------------- | ------------------------ | -------------------------------------------------------- |
| Profile        | `/api/v1/…` organization | Name, slug, addresses, tax identifiers                   |
| Payment terms  | quotation reference API  | Code, name, net days, advance %, active flag, sort order |
| Exchange rates | quotation reference API  | **The screen with the sharpest edge**                    |

**Exchange rates need care.** The database enforces non-overlapping validity windows per
currency pair with an `EXCLUDE` constraint. The natural UI — a table with "Add rate" — will
produce 409s constantly. Instead the editor is **timeline-first**: pick a currency pair, see
its rate periods on a horizontal timeline, and add a rate by clicking a gap. Overlap is
prevented by construction; the 409 becomes the backstop, not the interaction.

Rates are also **frozen onto quotations at creation**. The screen states this: editing a rate
does not re-price an existing quotation, and a user who assumes otherwise will draw the wrong
conclusion from the numbers.

---

## 14. Audit log UI

`/admin/audit`, ADMIN only. The audit trail exists on every mutation across every module
(`AuditLog` with `organizationId`, `actorId`, `requestId`, `entityType`, `entityId`, `action`,
`before`, `after`).

**Design as an investigation tool, not a log dump.** Three entry points:

1. **Global** — filter by actor, entity type, action, date range.
2. **Per-entity** — an "History" affordance on every detail screen, filtered to that record.
   This is where it will actually be used: _who changed this quotation's terms, and when?_
3. **By request id** — paste an `x-request-id` from a support ticket and see every row that
   request produced. This is the highest-value view and is the reason request-id propagation
   exists end to end (§20).

**Before/after rendering** is a field-level diff — changed fields only, old and new side by
side. Dumping raw JSON blobs makes the tool unusable for the people who need it.

**Blocker to confirm:** no audit-log read endpoint is listed among the merged APIs. This
screen needs `GET /api/v1/audit` with filters on actor, entity, action, request id and date
range. §30 sequences it; without it the screen cannot be built and per-entity history stays
unavailable.

---

## 15. Search architecture

**Two tiers, deliberately.**

**Tier 1 — scoped search inside a module.** The `q` parameter on each list endpoint. Debounced
at 250 ms, reflected in the URL, cancellable. This is the search people use most.

**Tier 2 — the command palette (`⌘K`).** A single input that fans out to the four module list
endpoints in parallel with `limit=5` each, grouped by module in the results. It is a
**navigator, not a report**: it takes you to a record. Selecting a result navigates; there is
no "search results page" for it beyond `/search` for the rare case where five per group is not
enough.

The palette also indexes **static destinations** (screens, settings pages) and **actions**
("New RFQ", "New quotation"), which is what makes it worth the keystroke — most invocations
are navigation, not search.

**Honest constraint.** There is no cross-entity search endpoint and no relevance ranking
across modules. The palette fans out and groups; it does not rank a supplier against an RFQ,
because nothing in the stack can. Building a unified search index is a backend project, noted
in §30 as out of scope.

**Performance note carried from the APIs:** every module's `q` uses SQL `contains` rather than
the declared trigram indexes. This is fine at current volume and will degrade; the portal's
debouncing and request cancellation reduce pressure but cannot fix it. Flagged, not worked
around.

---

## 16. Global state architecture

**Four kinds of state, four homes. Nothing shared that does not need to be.**

| Kind               | Home                         | Examples                                                  |
| ------------------ | ---------------------------- | --------------------------------------------------------- |
| Server state       | **React Query**              | Every record, every list. Never copied into another store |
| URL state          | **Search params**            | Filters, sort, cursor, active tab                         |
| Session state      | **React Context, read-only** | User, organization, CASL ability. Set once per session    |
| Ephemeral UI state | **Component state**          | Dialog open, form draft, selection                        |

**There is no Redux/Zustand/global store, and that is the design.** The overwhelming majority
of this application's state is server state, and React Query owns it. A second store would
duplicate it and the two would drift. The handful of genuinely global concerns — session,
ability, theme, density, toasts — are contexts that change rarely or never.

**The one exception worth naming:** the command palette's open state and the notification
unread count are app-global and live in small dedicated contexts rather than being prop-drilled
through the shell.

---

## 17. React Query cache strategy

**Key structure** — hierarchical, so invalidation can be surgical or broad:

```
['rfqs']                                  everything RFQ
['rfqs', 'list', { filters }]             one filtered list
['rfqs', 'detail', id]                    one record
['rfqs', 'detail', id, 'responses', p]    a sub-resource
```

**Staleness by data volatility, not one global default:**

| Data                                                                   | `staleTime`           | Reasoning                                                            |
| ---------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------- |
| Reference (countries, certifications, payment terms, categories, tags) | 30 min                | Changes rarely; refetching per screen is waste                       |
| Lists                                                                  | 30 s                  | Busy multi-user surface; a stale list is misleading                  |
| Detail records                                                         | 0 (always revalidate) | The ETag drives concurrency — a stale version means a guaranteed 412 |
| Workflow-critical detail (open approval dialog)                        | 0 + refetch on focus  | The decision must be made against current state                      |

**Detail records must never be served stale to a mutation.** This is the load-bearing rule.
The `If-Match` version comes from the cached record; a stale cache produces a 412 the user
cannot explain. Mutations therefore read the version from a freshly-validated query, and a 412
triggers an automatic refetch plus a **conflict dialog** (§20) rather than a bare error.

**Invalidation on mutation:**

- Detail mutation → invalidate `['rfqs', 'detail', id]` **and** `['rfqs', 'list']`, because
  status and totals appear in list columns.
- Workflow transition → same, plus the dashboard's approval-queue keys, plus sibling
  sub-resources (approvals, revisions).
- Reference-data mutation → invalidate the reference key and any list whose filter vocabulary
  it feeds.

**Optimistic updates are used sparingly and never on money or workflow.** They are appropriate
for notification read state and tag toggles. They are wrong for a quotation approval: showing
APPROVED and rolling back on a 403 would tell a user their commercial decision landed when it
did not. Workflow actions show a pending state and wait.

**Cache is cleared on identity change** (§5) and on organization change if multi-org switching
is ever added.

---

## 18. Form strategy

**React Hook Form + Zod resolver, with the schemas from `@triyara/validation`.** The client
validates against _the same schema object the API enforces_, imported from the workspace
package. This is the single highest-leverage decision in the frontend: client and server
validation cannot drift, because there is only one definition.

**Server errors map onto fields.** The API's 422 envelope carries `errors[].field`. The form
layer walks that array and calls `setError(field, …)` per entry, so a server-side rejection
lands on the input that caused it. Only errors with no `field` become a form-level banner.

**Draft persistence.** Long forms — product with specifications, RFQ with lines, quotation with
lines — persist to `sessionStorage` keyed by route. A refresh or an accidental navigation
mid-quotation must not discard twenty minutes of work.

**Unsaved-changes guard** on every dirty form via a navigation blocker.

**Line-item editors are the hard case.** RFQ lines and quotation lines are arrays of 1–200
rows edited as a set. They use a field-array editor with per-row validation, keyboard
navigation (tab across, enter for a new row), paste-from-spreadsheet into the grid, and a diff
summary before submit (§10). This is a distinct component built once and reused by both
modules — the shapes differ but the interaction is identical.

**Money and decimals.** All monetary values cross the wire as strings (`Decimal(18,4)`).
Inputs are string-based, validated by the shared schema, and **never** passed through
`parseFloat` for display. Rendering a stored total via floating point is how a quotation ends
up showing `1416.0000000000002`.

---

## 19. Table strategy

**TanStack Table (headless) + a project `DataTable` shell.** Headless because the styling is
ours (§26) and because every table here is server-driven — sorting, filtering and pagination
are API concerns, and a batteries-included grid would fight that.

**Cursor pagination, honestly presented.** The APIs are keyset-paginated: there is a next
cursor or there is not. There is no total count and no page number. The UI therefore offers
**Load more** / **Next–Previous** with a cursor stack, and does **not** render "Page 3 of 47".
Faking pagination over a keyset API means either lying about the total or making an expensive
count query per page.

**Standard anatomy:** toolbar (search, filters, column visibility, density) · header (sortable
columns only where the API supports that sort key) · body (skeleton rows on load, typed empty
state, error row with retry) · footer (page size, cursor controls).

**Column definitions are driven by the API's sort enum.** A column is only sortable if its key
appears in the endpoint's `sort` enum — enforced at the type level so an unsortable column
cannot be marked sortable.

**Row actions are ability-filtered** and, per §6, destructive actions appear for ADMIN only.

**Deliberately absent: bulk actions.** No bulk endpoints exist. A client-side loop is not a
bulk operation — it has no transaction and fails halfway. When bulk endpoints land, the table
already has selection infrastructure to switch on.

---

## 20. Error handling

**Every API error maps to a specific, actionable UI outcome.** The envelope is uniform
(`{ success, data, meta, errors }`), so this mapping is table-driven, written once.

| Status        | Meaning                                                | UI response                                                                                                           |
| ------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 401           | Session gone                                           | Clear cache, redirect to login with `next`                                                                            |
| 403           | Not permitted                                          | Inline explanation in context. For quotation approval, the specific threshold dialog (§11)                            |
| 404           | Absent **or another tenant's**                         | "Not found" — never "no access", matching the API's deliberate 404-not-403 tenancy choice                             |
| 409           | Conflict — duplicate, illegal transition, frozen terms | Show the server's message verbatim; it names the legal states                                                         |
| 412           | Stale version                                          | **Conflict dialog**: "This record changed while you were editing." Refetch, show what changed, offer retry or discard |
| 422           | Validation                                             | Field-level errors via `setError` (§18)                                                                               |
| 428           | `If-Match` missing                                     | A client bug. Log it; generic message to the user                                                                     |
| 429           | Rate limited                                           | Cooldown message with retry timing; disable the submit                                                                |
| 5xx / network | Server or transport                                    | Retry affordance, request id shown for support                                                                        |

**The 412 conflict dialog is the one worth building properly.** Optimistic concurrency is
pervasive here, and two people editing the same RFQ is a normal Tuesday. The dialog must show
_what_ changed, not just that something did.

**Request id everywhere.** Every response carries `meta.requestId`. It is attached to every
error surface, copyable, and it is the same id that appears in the audit log (§14) and server
logs — one string that ties a user's complaint to a trace.

**Boundaries:** a root boundary for catastrophic failure, a per-route boundary so one screen
cannot blank the shell, and per-card boundaries on the dashboard (§7).

**Never swallow an error into an empty state.** A failed list and an empty list look identical
if you are careless, and they mean opposite things.

---

## 21. Notifications

Two distinct channels that are easy to conflate:

**Transient toasts** — the outcome of _your_ action. Success is brief and quiet; failures
persist until dismissed and carry the request id. Single `aria-live` region, polite for
success, assertive for errors.

**Persistent notifications** — things the _system_ is telling you, backed by the existing
`/api/v1/notifications` API and the current `NotificationBell` component. Bell with unread
count, dropdown of recent, full page at `/notifications`, mark-read and mark-all-read (the one
place optimistic updates are clearly right).

**Polling, not realtime.** 60 s interval, paused when the tab is hidden. There is no WebSocket
or SSE infrastructure, and adding one for a notification badge is not justified. The domain
event bus exists server-side and could drive push later; the polling interval is a constant so
that swap is contained.

**Workflow events are notifications, not toasts.** "RFQ-2026-000012 is awaiting your approval"
must survive a page navigation. A toast that disappears in four seconds is not a work queue.

---

## 22. File upload architecture

The `@triyara/storage` package and `/api/v1/storage/upload` + `/api/v1/documents/presign`
already exist. The portal uses **presigned direct upload**, so file bytes never transit the
Next.js server.

```
  select file → client validates type and size before any network call
        │
        ▼
  POST /api/v1/documents/presign → { url, fields, documentId }
        │
        ▼
  PUT direct to storage, XHR progress events → progress bar, cancellable
        │
        ▼
  POST /api/v1/documents → record metadata, link to the entity
        │
        ▼
  invalidate the entity's document query
```

**Surfaces:** product images and documents, supplier certificates and documents, RFQ
attachments, account documents.

**Rules.** Client-side type and size validation first — rejecting a 200 MB file after upload is
hostile. Progress and cancellation on every upload. Uploads are **queued and independent**: one
failure in a multi-file drop does not discard the successes. Orphan risk is real (presigned
upload succeeds, metadata POST fails) — the UI retries the metadata step and surfaces a
persistent error if it cannot, since the file exists in storage but is invisible to the app.

Downloads go through `/api/v1/documents/:id/download`, which is authorization-checked; the
portal never constructs a storage URL directly.

---

## 23. Responsive layout

**This is a desktop-first application, and the design says so.** An export operations team
works on 1440px+ screens with dense tables. Pretending otherwise produces a portal that is
mediocre everywhere.

| Breakpoint | Layout                                                                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `< 768`    | Sidebar becomes a drawer. Tables become **card lists** — the three or four fields that matter per record, not a horizontally-scrolling table. Read and approve are supported; heavy editing is not |
| `768–1279` | Sidebar collapses to icons. Tables scroll horizontally with the first column pinned                                                                                                                |
| `≥ 1280`   | Full layout. Detail screens may use a two-column split (content + context panel)                                                                                                                   |

**Mobile scope is explicit: approve, review, look up.** A manager approving an RFQ from a
phone at a trade fair is a real use case and is supported. Building a 200-line quotation grid
on a phone is not, and attempting it would compromise the desktop editor that people actually
use all day.

**Print** is a first-class stylesheet for quotation and RFQ detail — these documents get
printed and PDF'd. Chrome hidden, tables un-truncated, page breaks between sections.

---

## 24. Folder structure

Feature-first, because this application is organised by business module and a type-first tree
(`components/`, `hooks/`, `utils/`) scatters one feature across five directories.

```
apps/web/src/
  app/
    (auth)/…                        existing
    (app)/
      layout.tsx                    AppShell
      dashboard/
      catalog/{products,categories,specifications,tags}/
      suppliers/
      rfqs/
      quotations/
      accounts/  verifications/  documents/  activity/  notifications/   existing
      admin/{users,roles,sessions,organization,audit,api-docs}/
    api/…                           UNCHANGED — the REST APIs
  features/
    <module>/
      api/          hooks + client calls; the only place a URL appears
      components/   module-specific components
      schemas/      re-exports and view-layer refinements of @triyara/validation
      types.ts      response shapes derived from the OpenAPI documents
  components/
    ui/             design-system primitives (§26) — eventually promoted to @triyara/ui
    data-table/     DataTable shell and column helpers
    forms/          field wrappers, line-item grid, upload control
    layout/         AppShell, Sidebar, TopBar, PageHeader, tabs
    feedback/       toasts, dialogs, empty states, error boundaries, skeletons
  lib/
    api-client.ts   fetch wrapper: envelope, ETag, error normalisation, request id
    query-client.ts React Query configuration
    ability.ts      client-side CASL context
    format.ts       money, dates, enum labels
  hooks/            cross-cutting: useDebounce, useUrlState, useConfirm
```

**`features/<module>/api/` is the only layer that knows about HTTP.** Grep for `/api/` and
every hit is in one directory per module. That is what makes the API surface auditable.

---

## 25. Component architecture

**Four tiers:**

1. **Primitives** (`components/ui/`) — Button, Input, Select, Dialog, Badge, Table, Tabs,
   Tooltip, Popover. No business knowledge. Built on Radix for behaviour and accessibility.
2. **Composites** (`components/`) — DataTable, FormField, FileUpload, EmptyState,
   ConfirmDialog, StatusBadge, PageHeader. Reusable across modules, still domain-agnostic.
3. **Feature components** (`features/<module>/components/`) — RfqStatusActions,
   QuotationPricingBreakdown, SupplierPicker, BidComparisonMatrix. Know their domain; know
   nothing about routing.
4. **Route components** (`app/**/page.tsx`) — compose the above. Thin by design.

**Rules that keep this from rotting:**

- **A component either fetches or renders, never both.** Data enters through props or a
  feature hook at the top of the screen.
- **Domain concepts get components, not conditionals.** `<StatusBadge status={…} />` renders
  every status in every module through one mapping. Ten inline `status === 'DRAFT' ? …` chains
  is how the same status ends up three different colours on three screens.
- **Server/client boundary is explicit and shallow.** `'use client'` sits at the top of the
  view component, not sprinkled through the tree.
- **Composition over configuration.** A `<DataTable>` with thirty props becomes unmaintainable;
  slots for toolbar, empty state and row actions do not.

---

## 26. Design system integration

**This is the critical path. There is no design system today (F1) — `@triyara/ui` exports
`cn()` and nothing else.** Every screen in §7–§14 depends on primitives that do not exist. If
this is not sequenced first, each screen invents its own button and the portal ends up
visually incoherent and impossible to restyle.

**Recommendation: shadcn/ui pattern on Radix + Tailwind.** Components are copied into
`components/ui/` and owned by the project rather than imported from a versioned package. For a
system that needs to match an established brand, ownership beats upstream defaults, and Radix
supplies the accessibility behaviour (focus traps, roving tabindex, ARIA wiring) that is
expensive and easy to get wrong.

**Tokens first, components second.** Colour, spacing, radius, typography, elevation and motion
are defined as CSS custom properties consumed by Tailwind. The existing `navy-deep` / `gold`
palette is the starting point but is a _marketing_ palette; an ERP needs a full semantic ramp:

- Surface levels (page, card, raised, overlay)
- Semantic status colours — one mapping used by every status badge across all four workflows
- Data-density scale for tables
- Focus ring, defined once, never removed

**Promotion path.** Primitives are built in `apps/web/src/components/ui/`, and promoted to
`@triyara/ui` once stable. Building them in the shared package first would mean churning a
published package during the period when the API is least settled.

**Dark mode:** the existing app is dark-only. The portal supports light and dark from the
token layer — long working sessions in a bright office are a real requirement — with dark as
default to match the current identity.

---

## 27. Accessibility strategy

**Target: WCAG 2.1 AA.** Not aspirational — enterprise procurement asks for it, and the
interaction patterns here (tables, dialogs, multi-step workflows) are exactly the ones that
break for keyboard and screen-reader users.

- **Keyboard: everything.** Every action reachable without a mouse, logical tab order, visible
  focus at all times, no keyboard traps. Dialogs trap focus while open and restore it on close.
- **Radix primitives** supply correct ARIA for menus, dialogs, tabs, tooltips and comboboxes.
  This is a large part of why §26 recommends them.
- **Tables**: real `<table>` semantics, `<caption>`, `scope` on headers, `aria-sort` on sorted
  columns. Row actions are buttons with accessible names, not icon-only affordances.
- **Forms**: every input labelled; errors linked via `aria-describedby`; `aria-invalid` on
  failure; the error summary receives focus on submit failure.
- **Live regions**: one polite region for toasts, one assertive for errors. Loading states
  announce; they do not silently swap content.
- **Colour is never the only signal.** Status badges carry text. Validation errors carry an
  icon and text. Bid comparison marks the cheapest with a label, not just a green cell.
- **Contrast** verified on the token ramp in both themes, including the gold-on-navy pairing
  which is the most likely to fail.
- **Motion** respects `prefers-reduced-motion`.

**Verification:** `eslint-plugin-jsx-a11y` in CI, `axe-core` assertions in component tests,
and a manual keyboard-and-screen-reader pass on each workflow screen before it ships.

---

## 28. Performance strategy

**Budgets** (mid-tier laptop, throttled fast-3G for initial load):

| Metric                                  | Budget             |
| --------------------------------------- | ------------------ |
| LCP, list screens                       | < 2.0 s            |
| INP                                     | < 200 ms           |
| Route JS (gzipped, excl. shared)        | < 150 KB           |
| Table interaction (sort/filter → paint) | < 100 ms perceived |

**Levers, in order of value:**

1. **Route-level code splitting** — the App Router gives this. The heavy pieces (line-item
   grid, bid comparison matrix, table library) are dynamically imported so a user who never
   opens a quotation never downloads the pricing editor.
2. **React Query caching** (§17) — the largest real-world win. Navigating back to a list is
   instant; reference data is fetched once per session.
3. **Server prefetch on detail routes** — dehydrate on the server, hydrate on the client, so a
   deep link paints content rather than a skeleton.
4. **Debounce + cancel on search** — 250 ms, with in-flight cancellation. This also protects
   the `contains`-based search noted in §15.
5. **Virtualisation only where measured** — the 200-row line grid and long bid matrices.
   Cursor-paginated lists cap at 100 rows and do not need it. Virtualising by default costs
   accessibility and find-in-page for no gain.
6. **`next/image`** for product images with explicit dimensions.
7. **Skeletons matched to final layout** so content does not shift in (CLS).

**Explicitly not doing:** a service worker, offline mode, or aggressive prefetch-on-hover
across the whole nav. Complexity without a demonstrated need.

---

## 29. Testing strategy

Mirrors the backend's layering, which has held up well across six modules.

| Layer         | Tool                     | Scope                                                                                                                                                                  |
| ------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit**      | Vitest                   | Formatters, cache-key builders, status→action mapping, error mapping. Pure functions, exhaustive                                                                       |
| **Component** | Vitest + Testing Library | Primitives and composites. Behaviour and a11y (`axe`), never implementation details                                                                                    |
| **Feature**   | Vitest + MSW             | A screen against a mocked API. Filters, pagination, form submission, **and every error path in §20** — the 412 conflict flow and the 403 approval-gate flow especially |
| **E2E**       | Playwright               | The four workflows end to end against a seeded database, per role                                                                                                      |

**MSW handlers are generated from the OpenAPI documents**, so a mock cannot drift from the
contract it stands in for. This matters: a portal tested against hand-written mocks that
disagree with the API is tested against fiction.

**E2E journeys — the ones that must never break:**

1. Product → supplier → RFQ → invite → publish → bid → compare → award
2. RFQ → quotation → approve → send → accept
3. Approval gate: EXPORT_MANAGER hits 403 on a high-value quotation; ADMIN approves it
4. Concurrency: two sessions edit one RFQ; the second gets the 412 dialog and recovers
5. Tenancy: a record from another organization returns 404, in list, detail and workflow

**Coverage posture:** meaningful thresholds on `features/` and `lib/`, none on route files —
chasing coverage on `page.tsx` produces tests that assert JSX exists.

**CI:** unit + component + feature on every PR; E2E against the `database` job's seeded
Postgres, which already exists in the pipeline.

---

## 30. Rollout order

Sequenced by dependency, not by visibility. Each wave is shippable.

### Wave 0 — Backend gaps (blocks later waves; small, in the existing pattern)

Not portal work, but the portal cannot be completed without it. Sequenced first because each
item blocks a screen:

| Gap                                                    | Blocks                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| RFQ supplier invitation (`invite`, `setParticipation`) | RFQ publish flow (§10) — without it, no RFQ reaches ISSUED     |
| Quotation `revise`, `replaceItems`, `setConditions`    | Quotation editing (§11) — without it the module is read-mostly |
| Audit log read endpoint                                | Audit UI and per-entity history (§14)                          |
| **Decision: `EXPORT_MANAGER` → `ReferenceData`**       | Whether catalog screens are usable by non-admins (§6, F3)      |

### Wave 1 — Foundation (no user-visible features; everything depends on it)

Design tokens · primitive components · AppShell, sidebar, top bar · API client with envelope,
ETag and error normalisation · React Query setup · DataTable · form layer · toasts and error
boundaries · a11y tooling in CI.

_Risk if skipped or rushed: every subsequent wave invents its own primitives and the portal
never becomes coherent. This is the wave to resist compressing._

### Wave 2 — Catalog (lowest workflow complexity, exercises the whole stack)

Products list and detail · categories tree · specifications · tags. Proves the table, form,
upload and detail-tab patterns on a module with no state machine.

### Wave 3 — Suppliers

List with facet-driven filters · detail tabs · supplier picker (needed by Waves 4 and 5) ·
certification expiry surfacing.

### Wave 4 — RFQ

List · detail with status-driven actions · line revision flow · invitations (needs Wave 0) ·
responses and bid comparison. The first genuine workflow module.

### Wave 5 — Quotation

List with revision awareness · detail · pricing breakdown · workflow actions including the
403 approval-gate flow · cost redaction throughout. Depends on Wave 0 for editing.

### Wave 6 — Administration

Users, roles (read-only), sessions, login attempts · organization settings · payment terms ·
exchange-rate timeline editor · audit log (needs Wave 0) · API docs viewer.

### Wave 7 — Polish and consolidation

Dashboard (needs the modules to exist) · command palette · migrate the legacy accounts /
verifications / documents / activity screens onto the design system · print stylesheets ·
performance pass against §28 budgets · full accessibility audit.

---

## Open questions for decision

1. **`EXPORT_MANAGER` and the catalog (F3).** Grant `ReferenceData` create/update, or accept
   that only administrators maintain the product catalog? This changes who can use Wave 2.
2. **Design system ownership.** Own the primitives in-repo (recommended), or adopt a
   third-party component library and accept its opinions?
3. **Mobile scope.** Is approve-and-review sufficient (recommended), or is full editing on
   tablets a requirement?
4. **Audit retention and access.** Is the audit log ADMIN-only, or should an export manager see
   history for records they own?
5. **Realtime.** Is 60 s polling acceptable for notifications and approval queues, or is push
   required? This decision is contained today and gets expensive later.

---

## Constraints honoured

- **No implementation, no code.** Design only.
- **No backend redesign.** The four Wave 0 items are additive endpoints over existing services,
  identified as blockers rather than proposed as changes to what exists.
- **Every screen maps to merged REST APIs.** Where an API does not exist, the screen is
  deferred and the gap is named — not designed around with a fiction.
