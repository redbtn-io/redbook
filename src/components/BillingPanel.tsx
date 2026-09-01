import { Badge, Card } from "@redbtn/redstyle";

import type { BillingInvoice, BillingSubscription } from "@/lib/billing";
import { invoicePresentation, subscriptionVariant } from "@/lib/billing";
import { formatDate, formatInterval, formatMoneyFromCents, relativeDays } from "@/lib/format";

/**
 * The signed-in user's billing relationship with redbtn.
 *
 * PERSONAL, NOT SHARED. This renders only on `/account`, never in the org's
 * book, because what one member pays redbtn is nobody else's business — and a
 * CRM whose shared pages leaked a colleague's card and invoices would be a
 * privacy incident, not a feature.
 *
 * A server component with no state: the page has already resolved the data,
 * so there is no fetch-on-mount, no spinner, and no window in which a stale
 * panel from a previous user could be shown.
 */

const RECENT_INVOICE_LIMIT = 5;

function ManageBillingLink({ accountsUrl }: { accountsUrl: string }) {
  return (
    <a
      href={`${accountsUrl}/`}
      className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover"
    >
      Manage billing
    </a>
  );
}

function SubscriptionRow({ subscription }: { subscription: BillingSubscription }) {
  const price = formatMoneyFromCents(subscription.amountCents, subscription.currency);
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-text-primary">{subscription.productName}</span>
          <Badge variant={subscriptionVariant(subscription.status)}>{subscription.status}</Badge>
        </div>
        {subscription.currentPeriodEnd ? (
          <p className="mt-0.5 text-sm text-text-secondary">
            {/*
              `cancelAtPeriodEnd` changes what the same date MEANS. Rendering
              "Renews" on a subscription the user already cancelled is the kind
              of wrong that generates a support email.
            */}
            {subscription.cancelAtPeriodEnd ? "Ends" : "Renews"} {formatDate(subscription.currentPeriodEnd)}
            <span className="text-text-muted"> · {relativeDays(subscription.currentPeriodEnd)}</span>
          </p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <span className="font-medium text-text-primary">{price}</span>
        <span className="text-sm text-text-muted">{formatInterval(subscription.interval)}</span>
      </div>
    </div>
  );
}

function InvoiceRow({ invoice }: { invoice: BillingInvoice }) {
  const presentation = invoicePresentation(invoice);
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-sm text-text-primary">{invoice.number ?? invoice.id}</span>
          <Badge variant={presentation.variant}>{presentation.label}</Badge>
        </div>
        <p className="mt-0.5 text-sm text-text-secondary">
          {presentation.dateLabel} {formatDate(presentation.date ?? undefined)}
        </p>
      </div>
      <span className="shrink-0 font-medium text-text-primary">
        {formatMoneyFromCents(presentation.amountCents, invoice.currency)}
      </span>
    </div>
  );
}

export function BillingPanel({
  subscriptions,
  invoices,
  unavailable,
  accountsUrl,
}: {
  subscriptions: BillingSubscription[];
  invoices: BillingInvoice[];
  unavailable: boolean;
  accountsUrl: string;
}) {
  const recent = invoices.slice(0, RECENT_INVOICE_LIMIT);

  return (
    <Card className="select-content p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">redbtn Billing</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Your own subscription with redbtn. Private to you — it is not part of your book and no
            other member of your organization can see it.
          </p>
        </div>
        <ManageBillingLink accountsUrl={accountsUrl} />
      </div>

      {unavailable ? (
        /*
          Honest and non-alarming. The panel is a passenger on this page: when
          billing cannot be reached the rest of the account page still renders,
          and the user is pointed at the service that definitely knows.
        */
        <p className="mt-4 rounded-lg border border-border bg-bg-secondary p-3 text-sm text-text-secondary">
          Billing is unavailable right now, so your plan could not be loaded. Nothing has changed —
          try again shortly, or open Manage billing.
        </p>
      ) : (
        <>
          <section className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Plan</h3>
            {subscriptions.length > 0 ? (
              <div className="mt-1">
                {subscriptions.map((subscription) => (
                  <SubscriptionRow key={subscription.id} subscription={subscription} />
                ))}
              </div>
            ) : (
              /*
                The common case, stated plainly. Most redBook users have never
                bought a redbtn service, and "no subscription" is an ordinary
                fact about their account rather than an error to apologise for.
              */
              <p className="mt-2 text-sm text-text-secondary">
                No active subscription. redBook access does not require one.
              </p>
            )}
          </section>

          {recent.length > 0 ? (
            <section className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Recent invoices
              </h3>
              <div className="mt-1">
                {recent.map((invoice) => (
                  <InvoiceRow key={invoice.id} invoice={invoice} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </Card>
  );
}
