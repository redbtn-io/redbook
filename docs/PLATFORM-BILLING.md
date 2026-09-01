# Platform billing: redBook orgs billing their own clients

**Status: designed, frozen, not built.** Nothing in this document exists in
code. It is here so the decision does not have to be made again from scratch
the day someone asks for it.

## Summary

A redBook org keeps its book of business in redBook, so the obvious next thing
it wants is to invoice the accounts in that book and get paid. The mechanism is
**Stripe Connect**: each org connects its own Stripe account through Stripe's
hosted onboarding, and every charge and invoice for that org's clients is
created *on the org's connected account* rather than on redbtn's. Stripe carries
KYC, underwriting and settlement liability for the connected account, which is
the entire reason to use Connect instead of processing other people's money on
redbtn's merchant identity. redbtn's revenue is an **application fee per
transaction** (take rate TBD), which is how every CRM that touches payments
monetizes. The work lands as **platform mode** inside the existing redbilling
service, not as a new product.

## The flow

1. **Onboard.** An org admin clicks "Set up payments" in redBook. redbilling
   creates a Connect account and returns a Stripe-hosted onboarding link. The
   org completes KYC with Stripe directly. redbtn never sees or stores bank
   details, tax IDs or identity documents.
2. **Map.** On completion, redbilling stores `orgId -> acct_xxx` plus the
   capability flags Stripe reports (`charges_enabled`, `payouts_enabled`). An
   org without both is onboarded but not yet chargeable, and the UI must say so.
3. **Invoice.** The org creates an invoice against a redBook client. redbilling
   creates the Stripe customer and invoice **on the connected account** and sets
   an `application_fee_amount` (or `application_fee_percent` for
   subscriptions). The client pays Stripe; funds settle into the org's Stripe
   balance; redbtn's fee lands in redbtn's.
4. **Webhook.** Connect events arrive on a separate endpoint carrying an
   `account` field. redbilling resolves that back to an org and records the
   state change.
5. **See it.** The org sees paid / open / overdue against the client record in
   redBook, in the same place it already sees notes and interactions.

## What redbilling grows

- **Org to connected-account mapping**, with capability flags. This is the one
  new piece of authoritative state.
- **Connect onboarding endpoints**: create account, create/refresh account link,
  read status.
- **A Connect webhook endpoint.** Connect events are a separate stream from the
  platform's own account events and must not be mixed into the existing handler.
- **A fee parameter** on invoice and subscription creation.
- **`stripeAccount` thread-through in `@redbtn/redpay`'s Stripe provider.**
  Worth being precise, because this was previously assumed to already exist:
  at `@redbtn/redpay@1.1.0` (current `main`, current registry `latest`) it does
  **not**. `resolveStripeConfig` in `src/providers/stripe/client.ts` accepts
  only `{ apiKey, webhookSecret }` and builds one `new Stripe(apiKey)` client;
  the string `stripeAccount` appears nowhere in the package, including the
  card-on-file path added in 1.1.0. The good news is that this is genuinely
  additive rather than a redesign: the Stripe SDK takes `{ stripeAccount }` as a
  per-request options argument on every call, so the change is to carry an
  optional `stripeAccount` through `StripeConfig` and each provider method. That
  is the difference between "extend redbilling" and "rewrite it", and it is
  still an extension.

## What redBook grows

UI only, and only for org-facing money:

- A "Payments" setup surface for org admins (connect, status, disconnect).
- Invoice creation from a client record, and an invoice list per client.
- Payment status on the client, so a rep sees "$12,000 outstanding, 21 days"
  next to the account they are about to call.

None of this touches the personal **redbtn Billing** panel on `/account`, which
shows the signed-in user what *they* pay redbtn and is read from redbilling's
per-caller endpoints. The two never share a surface.

## Hard boundaries

These are the lines that make the design safe. Crossing any of them turns a
product feature into a compliance problem.

- **redbtn's own merchant keys are never used for org billing.** An org's client
  charges are created on that org's connected account, full stop. The moment
  redbtn's platform account processes money owed to an org's client, redbtn is
  the merchant of record for a service it did not deliver.
- **accounts.redbtn.io and the redauth entitlements loop stay exclusively
  redbtn-service billing.** Entitlements answer "what has this user bought from
  redbtn". An org's customer paying an org's invoice grants no redbtn
  entitlement and must never be written into that loop.
- **redFinance stays single-tenant.** Its own scope forbids tenants. Org
  bookkeeping on top of Connect payouts would be a separate product decision,
  not an extension of redFinance, and pretending otherwise is how a personal
  finance tool acquires an accidental multitenancy surface.
- **Connect webhooks are separate from platform webhooks.** Same reason as
  above: two event streams with different trust and different meaning.

## Trigger condition

Build this when **either** is true:

- a real org asks to bill its clients through redBook, or
- George decides redBook's business model includes a take rate.

Until one of those happens the design is frozen and no code gets written. A
Connect integration nobody is using is not free: it is a live Stripe platform
relationship, a KYC support surface, and a dispute queue.

## Open questions (answer these before writing code)

1. **Fee percentage.** What is the take rate, and is it flat or per-plan? This
   is a pricing decision, not an engineering one, and it determines whether the
   feature is worth its support cost.
2. **Refunds and disputes.** When an org's client disputes a charge, Stripe
   pulls the funds from the *org's* balance, but the org's first instinct is to
   ask redbtn. How much of that support burden is redbtn taking on, and is any
   of it in the UI at all versus "go to your Stripe dashboard"?
3. **Payout visibility.** Does redBook show the org its Stripe balance and
   payout schedule (nice, and a support magnet), or does it link out to Stripe
   Express and show nothing (boring, and cheap)? Recommend linking out first.
4. **Connect account type.** Express (Stripe-hosted dashboard, least work) vs
   Standard (org keeps its own full Stripe account). Express is the default
   assumption above; Standard matters if an org already has Stripe and refuses
   a second account.
5. **Who in an org may connect payments and issue invoices?** redBook's org
   model treats every member as equal on the shared book by design. Money is
   the first thing that plausibly needs a role check, and that is a change to
   the tenancy model, not just a new screen.
