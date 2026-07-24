# Shared package decisions for redbook-functions

## Implemented for this service

- `@redbtn/redauth@1.4.3`
  - Used for verification of the shared `red_session` magic-link session (Bearer
    and cookie transport). Login issuance remains owned by redAuth; redbook
    only receives the verified principal.
- `@redbtn/redlog@0.1.0`
  - Applicable to this functions service for centralized operational logging.
- `@redbtn/redsecrets@0.1.0`
  - Applicable to this functions service for service-scope secret resolution and no direct env secret fallback.

## Evaluated but intentionally not adopted

- `@redbtn/redstyle`
  - Not applicable: this unit is backend-only (`functions`), with no shared styling/UI surface to share.
