# Shared package decisions for redBook

## Adopted

- `@redbtn/redauth@^1.5.1`
  - Verification of the shared `red_session` ecosystem session (cookie and
    Bearer transports), plus `clearSessionCookies` for sign-out. Session
    ISSUANCE stays with accounts.redbtn.io; redBook only ever receives and
    verifies a principal.
- `@redbtn/redstyle@^0.6.2`
  - The design system: tokens, base styles, and the shared React components
    (Button, Card, Badge, Input, Textarea, Select, Tabs). Adopted rather than
    re-implemented so redBook tracks house style automatically.
- `@redbtn/redlog@0.1.0`
  - Centralized operational logging, behind a guarded lazy wrapper with a
    console fallback so logging can never fail a request.
- `@redbtn/redsecrets@0.1.0`
  - Optional resolution of `JWT_SECRET` from the encrypted store when
    `REDBOOK_SECRETS_ENCRYPTION_KEY` is set. The normal path is the RedRun
    workspace `appConfig.env`, because RedRun's redsecrets integration is
    build-time only and this is a runtime credential.

## Evaluated but intentionally not adopted

- `@redbtn/redorg`
  - redBook's ownership model is per user, not per organization. Adding an
    org/tenant layer would introduce a sharing model nobody has specified and
    a second source of authority beside the session. Revisit if and when the
    book needs to be shared between people.

## Contract

`scripts/verify-shared-dependencies.mjs` (run in CI and covered by
`tests/shared-dependencies.test.ts`) asserts that the `@redbtn` scope resolves
only to `registry.redbtn.io` and that each pinned shared package is an exact
version with a real publication integrity hash. That is what stops a shared
package drifting or being satisfied from a public mirror.
