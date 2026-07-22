# Shared package decisions for redbook-functions

## Implemented for this service

- `@redbtn/redlog@0.1.0`
  - Applicable to this functions service for centralized operational logging.
- `@redbtn/redsecrets@0.1.0`
  - Applicable to this functions service for service-scope secret resolution and no direct env secret fallback.

## Evaluated but intentionally not adopted

- `@redbtn/redauth`
  - Not applicable: `redbook-functions` has no authentication surface for this service and does not host auth flows.
- `@redbtn/redstyle`
  - Not applicable: this unit is backend-only (`functions`), with no shared styling/UI surface to share.
