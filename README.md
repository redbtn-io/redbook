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

## Ownership

Every record carries the `ownerId` of the principal that created it, and every
read and write is filtered by it. The filter is derived from the verified
session inside `src/lib/authz.ts` and never from a request parameter, so
another user's record is indistinguishable from one that does not exist (404,
not 403). `src/lib/repository.ts` takes a `Principal` rather than an owner id
specifically so a query cannot be issued without one.

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
| GET | `/clients/[clientId]` | session |
| GET | `/healthz`, `/ready` | none |
| GET | `/api/config` | none (non-secret only) |
| GET | `/api/me` | session |
| GET, POST | `/api/clients` | session |
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

## Seed data

A user whose book is empty gets one starter client — FinThrive, with contacts,
notes, and interactions — so the app opens with something real-looking. The
company is real; the people, numbers, and conversations attached to it are
illustrative placeholders using `example.com` addresses. Seeding runs only
when the user has zero clients, so deleting a seeded record does not bring it
back. Set `REDBOOK_AUTOSEED=false` to disable.

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
