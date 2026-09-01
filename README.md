# redBook

The redbtn CRM. Clients, contacts, notes, and every interaction in one place,
at [book.redbtn.io](https://book.redbtn.io).

## Stack

Next.js 16 (App Router) serving both the UI and the API, MongoDB for storage,
`@redbtn/redstyle` for the design system, and `@redbtn/redauth` for session
verification. One container on port 3000.

## Authentication

redBook rides the ecosystem's shared `red_session` cookie. It **verifies**
sessions and never mints them: sign-in belongs to
[accounts.redbtn.io](https://accounts.redbtn.io), and an unauthenticated
visitor is redirected there with `?next=<this page>` so they land back where
they started.

Verification uses the shared `JWT_SECRET` (HS256) — the same secret accounts
signs with. Three transports are accepted, each failing closed:

| Transport | Header | Notes |
|---|---|---|
| Cookie | `red_session` | The normal browser path. Duplicate cookies are rejected rather than resolved. |
| Bearer | `Authorization: Bearer <jwt>` | A present-but-invalid bearer never falls back to the cookie. |
| Service | `X-User-Id` + `X-Internal-Key` | Only when `INTERNAL_SERVICE_KEY` is configured. |

There are no API keys and no local login page.

## Tenancy

The access boundary is the **organization**. One org is one shared book of
business: every member sees and edits the same clients, contacts, notes, and
interactions. `createdBy` on a record is authorship for audit and attribution,
deliberately **not** a permission check — a CRM where a colleague cannot edit a
client you typed in is not a shared book.

Orgs and membership come from `@redbtn/redorg`, consumed as a library against
redBook's own `redbook` database (`org_` collection prefix). `getUserOrgs` is
the only source of org authority: an `orgId` from a request is honoured solely
after being matched against that caller's real memberships, and a mismatch is a
403 rather than a silent fallback to their default book.

Every read and write carries an org filter derived from a proven
`OrgMembership`. `src/lib/repository.ts` takes that type rather than a bare
string precisely so a query cannot be issued for a tenant nobody proved, and
`requireOrgFilter` throws instead of returning `{}` — an unscoped filter would
read every tenant at once. Another org's record is indistinguishable from one
that does not exist (404, not 403).

### Members

`REDBOOK_ORG_MEMBER_EMAILS` seats people in the bootstrapped org. Emails are
resolved to ecosystem userIds **read-only** against the shared `redauth`
directory — redBook never creates ecosystem identities, because minting a real
fleet-wide user as a side effect of seeding placeholder data is not its call.

An email with no identity yet becomes a **pending member** (one row in
`org_pending_members`) and is converted into real membership the first time
that person signs in. That is how the Josh placeholder stays easy to update:
change the env var, or edit the single pending row.

## Data model

`clients` → `contacts`, `notes`, `interactions` (all keyed by `clientId`).

An AI coaching/QBR layer is planned but deliberately not built. The model is
shaped for it: `Note.body`, `Interaction.summary`, `Interaction.transcript`,
and `Interaction.followUps` are freeform first-class fields, not rigid enums
or denormalized rollups.

## Routes

| Method | Path | Auth |
|---|---|---|
| GET | `/` | session (redirects to accounts) |
| GET | `/account` | session |
| GET | `/clients/[clientId]` | session |
| GET | `/healthz`, `/ready` | none |
| GET | `/api/config` | none (non-secret only) |
| GET | `/api/orgs` | session |
| GET | `/api/me` | session |
| GET | `/api/redbtn-billing/{subscriptions,invoices}` | session (personal, never org-scoped) |
| GET, POST | `/api/clients` | session + org |
| GET, PATCH, DELETE | `/api/clients/[clientId]` | session |
| GET, POST | `/api/clients/[clientId]/{contacts,notes,interactions}` | session |
| PATCH, DELETE | `/api/{contacts,notes,interactions}/[id]` | session |
| POST | `/send` | none (legacy lead form) |
| GET | `/signout` | none |

`POST /send` is the legacy public lead-capture endpoint carried over from the
original `functions/` service. It is intentionally unauthenticated, which is
why every field is validated and escaped in `src/lib/email.ts` before it
reaches an email sent from a trusted sender identity. It lives outside
`/api/*` so it can never be mistaken for a session-protected route.

## Your account and redbtn billing

`/account` is the one PERSONAL surface in redBook. Everything else is the org's
shared book, where every member deliberately sees the same records; this page
shows only what belongs to the signed-in human, which is why the **redbtn
Billing** panel lives there and nowhere else. On `/` it would show whichever
colleague happened to be signed in to every other member of the org.

The panel shows that person's own redbtn subscription, their recent invoices,
and a link to accounts.redbtn.io to manage the payment method. A `draft`
invoice is Stripe's word for a charge that has not happened yet, so it renders
as **Upcoming** with its charge date rather than as the alarming word "draft".
Most users have no subscription at all, and that is stated plainly rather than
treated as an error.

The data comes from `billing.redbtn.io`, **server-to-server**. It has to:
redbilling's CORS allowlist admits `accounts.redbtn.io` and nothing else, so a
`fetch` from a book.redbtn.io page is blocked before it starts. CORS is a
browser policy, not an authorization boundary, so `src/lib/billing.ts` calls
billing from the server instead and forwards **exactly one thing** — the
caller's own `red_session` cookie. No service key, no internal key, no
`X-User-Id`. redBook therefore *cannot* ask billing for anyone else's data,
because it holds no credential that would let it, and per-user isolation is
inherited from redbilling's own auth rather than re-implemented here. Only
`red_session` is forwarded, never the raw `Cookie` header, so unrelated
`.redbtn.io` app cookies are not relayed to another service.

The upstream call is time-boxed at 10s and every failure mode (timeout, 5xx,
unreadable body, no forwardable cookie) degrades to "billing unavailable" in
the panel rather than breaking the page. The `/api/redbtn-billing/*` routes
expose the same data over HTTP and answer **502**, not an empty list, when
billing cannot be reached: "you have no subscription" and "billing did not
answer" must not be the same answer, or a paying customer gets told they have
no plan. `BILLING_URL` overrides the upstream host; it defaults to
`https://billing.redbtn.io`.

The header's email link to `/account` sets `prefetch={false}` deliberately.
That page calls a live Stripe-backed service on render, and Next prefetches
in-viewport links, so leaving prefetch on would fire an upstream request on
every page view nobody asked for. Same lesson as the sign-out prefetch bug.

Orgs billing **their own** clients is a different product and is deliberately
not built. The design is frozen in `docs/PLATFORM-BILLING.md`.

## Seed data

**FinThrive is the org** — Josh's employer, a real US healthcare revenue-cycle
management SaaS company. It is not a client.

An org whose book is empty gets three starter clients, which are the kind of
accounts a FinThrive rep would actually carry: healthcare **providers** buying
revenue-cycle software (an integrated delivery network, a physician group, and
a community hospital in an RFP). Each has contacts, a pinned note, and logged
interactions — two with full transcripts. All of it is invented, with
`example.com` contact details.

Seeding runs only when the org has zero clients, so deleting a seeded record
does not bring it back. Set `REDBOOK_AUTOSEED=false` to disable.

## Development

```bash
npm install          # needs ~/.npmrc with registry.redbtn.io credentials
cp .env.example .env.local
npm run dev
```

```bash
npm test                          # vitest
npm run typecheck
npm run verify:shared-dependencies
npm run build
```

## Deployment

RedRun workspace `redbook`, git source `redbtn-io/redbook`, tracked branch
`main`, `autoDeploy: true` — **merging to `main` is the deploy**. The contract
is in `deploy/redrun-app.json`.

Runtime environment lives in the workspace `appConfig.env` (RedRun's redsecrets
integration is build-time only). Two things that will cost you an afternoon:

- **Do not set `NODE_ENV=production` in `appConfig`.** It reaches the image
  build and makes `npm ci` skip devDependencies, which breaks `next build`.
  The Dockerfile sets it in the runner stage only.
- **A `JWT_SECRET` stored with surrounding quotes verifies nothing** and
  reports itself as a signature mismatch. `loadRuntimeConfig` strips wrapping
  quotes defensively, but store it unquoted.

`PUBLIC_URL` must be the real `https://book.redbtn.io` in production: accounts
only accepts an https, first-party `*.redbtn.io` return URL and silently
redirects elsewhere otherwise.

## Git workflow

Work on `agent/*` branches, PR into `beta`, then promote `beta` → `main` with a
merge commit. Never push directly to `main` or `beta`.
