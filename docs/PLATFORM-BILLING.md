# Platform billing: redBook orgs billing their own clients

**Status: the Connect core is built and merged into redbilling, and is waiting
on one dashboard step (2026-09-05).** The design below was frozen when it was
written and is now unfrozen: the platform planning round of 2026-09-05 folded it
into a larger back office plan and scheduled the Connect work.

What exists in redbilling as of Phase 2A-i: onboarding routes that create a
Standard account and mint an Account Link, a Connect webhook on its own signing
secret that maps `event.account` to an organization and quarantines anything it
cannot map, capability refresh, org-level platform billing routes, an audit row
before every money action, and a durable signed feed of money events for
whatever books them (`redbilling/docs/BILLING-EVENTS.md`). Permissions come from
the shared directory, read-only.

What does NOT exist yet: **Connect is not enabled on the redbtn Stripe
account.** Stripe answers "you can only create new accounts if you've signed up
for Connect", so no connected account has been created and nothing has run
against Stripe's Connect API. The four dashboard steps are in
`redbilling/docs/CONNECT.md`, and onboarding stays switched off
(`CONNECT_ENABLED=false`) until they are done. Invoicing on the connected
account with an application fee lands in 2A-ii.

Read the sections below as the agreed design; where they describe running code,
check `redbilling/docs/CONNECT.md` for what is actually wired.

**Plan:** https://claude.ai/code/artifact/f606a8db-e638-4623-a756-39aee3aac287

Two things changed with that plan, and only two:

1. **Org bookkeeping lives in redOffice, not in redBook.** A new multitenant
   back office app, `office.redbtn.io`, owns each org's books, counterparties,
   issued paper and compliance state, with REDBTN LLC as org zero. redBook stays
   the CRM. It does not grow a ledger, a document archive or a tax pack, and
   redOffice reaches redBook's book of business over HTTP through an explicit
   org mapping rather than by sharing a database.
2. **The trigger condition was met by the second clause, not the first.** No org
   has asked yet; George decided the platform includes tenant billing. See
   "Trigger condition" below, which still stands as written.

Everything else in this document, in particular every hard boundary, still holds
exactly as originally written.

## Summary

A redBook org keeps its book of business in redBook, so the obvious next thing
it wants is to invoice the accounts in that book and get paid. The mechanism is
**Stripe Connect**: each org connects its own Stripe account through Stripe's
hosted onboarding, and every charge and invoice for that org's clients is
created *on the org's connected account* rather than on redbtn's. Stripe carries
KYC, underwriting and settlement liability for the connected account, which is
the entire reason to use Connect instead of processing other people's money on
redbtn's merchant identity. redbtn's revenue is an **application fee per
transaction** (take rate still undecided, see the open decisions at the end),
which is how every CRM that touches payments monetizes. The work lands as
**platform mode** inside the existing redbilling service, not as a new product,
and the invoicing surface that sits on top of it is redOffice's rather than
redBook's.

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

**Revised 2026-09-05:** the authoritative invoicing and bookkeeping surface is
**redOffice**, not redBook. An org's ledger, issued invoices, document archive
and tax pack live there. What redBook keeps is the CRM-side read: the payment
status a rep needs while looking at an account. Whether redBook renders an
invoice form of its own at all, or only links across to redOffice with the
client already selected, is a UI call to make when the surface is built. Either
way redBook does not become the book of record for money, and it does not
duplicate the ledger.

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
  finance tool acquires an accidental multitenancy surface. *(2026-09-05: that
  separate product decision was taken, and the answer is a separate app,
  redOffice. redFinance is still not being made multitenant. Whether REDBTN
  LLC's own books move into redOffice as org zero is decision 1, still George's
  open call, recorded in redfinance `docs/SCOPE.md`.)*
- **Connect webhooks are separate from platform webhooks.** Same reason as
  above: two event streams with different trust and different meaning.

## Trigger condition

Build this when **either** is true:

- a real org asks to bill its clients through redBook, or
- George decides redBook's business model includes a take rate.

Until one of those happens the design is frozen and no code gets written. A
Connect integration nobody is using is not free: it is a live Stripe platform
relationship, a KYC support surface, and a dispute queue.

**2026-09-05: the second condition fired.** George decided the platform bills
tenants, so the design is no longer frozen and the Connect work is scheduled
inside redbilling. The cost warning above did not stop being true: it is the
reason the first tenants are known ones and the reason the take rate is a
separate decision rather than an assumption baked into the build.

## Still open on 2026-09-05

These are the decisions that must be answered before or during the build. They
are George's, not an implementer's, and nothing below has been settled.

1. **Connect account type: Standard or Express.** The prose above assumes
   Express. The 2026-09-05 plan recommends **Standard**, on the grounds that it
   keeps redbtn out of merchant-of-record status and out of the dispute and
   fraud liability that comes with Express. The recommendation is not the
   decision. Until George picks, treat the account type as unfixed and do not
   let either choice leak into a schema. This supersedes open question 4 below,
   which is kept for its reasoning.
2. **Take rate.** The plan's recommendation is 0 bps at launch, stored as a
   per-org `feeBps` so a rate can be set later without a migration, and
   revisited once two tenants are live. Still a pricing decision, still open.
   This is the same question as open question 1 below.
3. **redOffice pricing and entitlement product key.** Whether tenant access is
   billed as a standalone product, folded into a redSuite bundle, or free for
   org zero and the first tenant while pricing is settled. Open, and tangled
   with the Become monetization epic's grandfathering and pricing decisions.
4. **Who in an org may connect payments and issue invoices.** Unchanged and
   still open, but it now lands against redOffice's permission model (`money:*`
   verbs in the shared org directory) rather than redBook's flat "every member
   is equal" org model. Same question, different owner. See open question 5.

## Open questions (the original list, kept for its reasoning)

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
