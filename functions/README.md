# redbook functions service

This service is the authenticated, Mongo-backed API foundation for the
redbook alpha. It consumes shared packages from `registry.redbtn.io` and does
not vendor credentials or shared package source.

## Local development

```sh
npm install
npm test
npm run build
```

The normal `npm start` path performs the production-style bootstrap: it opens
the app Mongo database, reads `JWT_SECRET`, `EMAIL_USER`, and `EMAIL_PASS` from
the `redbook` global scope in `@redbtn/redsecrets`, and then starts port 3000.
The `REDBOOK_SECRETS_ENCRYPTION_KEY` bootstrap key must be supplied by the
runtime. It is not a replacement for the application credentials.

## Runtime contract

- `GET /healthz` and `GET /ready` are unauthenticated deployment probes. They
  return 503 until configuration is valid and Mongo responds to `ping`.
- `GET /api/config` returns non-secret channel, URL, database-name, and auth
  metadata. It never returns connection strings or secret values.
- `GET /api/me` demonstrates the protected CRM route boundary. It accepts the
  shared `red_session` cookie or an `Authorization: Bearer` token and returns
  only the verified redAuth principal.
- Every future `/api/*` route is protected by default. Contact and interaction
  handlers must additionally use `requireOwnership()` / `ownerFilter()` so
  ownership is derived from the principal instead of request input.
- The legacy public `POST /send` path is preserved for the existing lead-form
  flow; its Gmail credentials are resolved by the redsecrets bootstrap.

## Beta deployment

[`deploy/redrun-beta.json`](../deploy/redrun-beta.json) is the checked-in
RedRun workspace/domain contract: workspace `redbook`, beta branch `beta`,
port `3000`, domain `redbook.redbtn.io`, and health path `/healthz`. Configure
the listed environment names as RedRun workspace secrets/config before the
first beta build. The service itself does not deploy or merge anything.
