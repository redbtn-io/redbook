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

- `@redbtn/redorg@^0.2.1`
  - Organizations and membership. An org is a redBook TENANT: one org is one
    shared book of business, and org membership is the access boundary for
    every CRM record. Consumed as a LIBRARY (it is a mongoose package, not a
    service) against redBook's own `redbook` database with the default `org_`
    collection prefix, so its slugs are redBook-local and cannot collide with
    another app's in the fleet directory.
  - Used for: `getUserOrgs` (membership resolution on every request),
    `getOrgBySlug`, `createOrg`, `getMember`, `getRoles`, `addMember`.

## Evaluated but intentionally not adopted

- `@redbtn/redauth` `findOrCreateUser` against the shared directory
  - Seeding "these humans are members" needs email to userId resolution, and
    redOrg keys membership by userId. redBook resolves that READ-ONLY against
    the shared `redauth` users collection (`src/lib/directory.ts`). It does
    not create ecosystem identities: minting a real, fleet-wide user record as
    a side effect of seeding placeholder data is not redBook's call. An email
    with no identity yet becomes a pending member instead, claimed the first
    time that person signs in through accounts.redbtn.io.

## Contract

`scripts/verify-shared-dependencies.mjs` (run in CI and covered by
`tests/shared-dependencies.test.ts`) asserts that the `@redbtn` scope resolves
only to `registry.redbtn.io` and that each pinned shared package is an exact
version with a real publication integrity hash. That is what stops a shared
package drifting or being satisfied from a public mirror.
