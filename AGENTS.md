# redBook

redBook is the redbtn CRM: clients, contacts, notes, and interactions, org
scoped. It is live at https://book.redbtn.io.

## Deploy source of truth

GitHub `main` on `redbtn-io/redbook` is the deploy source of truth, full stop.

- The redRun workspace `redbook` (id `6a7dd8ab61ada2d0fbc4afb9`) runs in git
  source mode from `redbtn-io/redbook` branch `main` with autoDeploy on and a
  GitHub webhook registered. A push to `main` is what ships.
- Do not push files into the workspace out of band (no MCP workspace file
  updates as a deploy path). Workspace files that diverge from git get
  reverted by the next git sync, and real work has been lost that way in this
  estate before. If you find workspace state that is not in git, reconcile it
  into git first, then let the normal deploy carry it.
- Local clones are working copies only. Commit and push; never treat a clone
  on any fleet host as the live source.

## Shape

- Next.js app, MongoDB database `redbook` (clients, contacts, notes,
  interactions collections).
- Tenancy is `@redbtn/redorg` consumed as a library against the same
  database, `org_` prefixed collections. An org is one shared book of
  business and is the access boundary for every record.
- Auth is redbtn accounts SSO (the shared `red_session` cookie) via
  `@redbtn/redauth`.
- Seeded member emails that do not resolve to a directory user yet are
  parked in `org_pending_members` and convert to real memberships on first
  sign-in with that email.

## House rules

- No secrets in the repo, in commits, or in this file. Runtime configuration
  lives in the redRun workspace environment.
- Plain English in docs and commit messages, commas over dashes.
