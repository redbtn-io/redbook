import { headers } from "next/headers";

import { Shell } from "@/components/Shell";
import { BillingPanel } from "@/components/BillingPanel";
import { requirePrincipal } from "@/lib/server-session";
import { fetchBillingOverview } from "@/lib/billing";
import { getConfig } from "@/lib/config";

/**
 * Your account — the one PERSONAL surface in redBook.
 *
 * Everything else in this app is the org's shared book, where every member
 * sees the same records by design. This page is the opposite: it shows only
 * what belongs to the signed-in human, which is why the redbtn billing panel
 * lives here and nowhere else. Put it on `/` and every FinThrive member would
 * be looking at whichever colleague happened to be signed in.
 *
 * There is deliberately no org lookup and no seeding here: this page is about
 * the person, so it works the same whether they belong to one book, several,
 * or none.
 */
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const principal = await requirePrincipal("/account");

  // The RAW cookie header, not `cookies().get()`. `sessionCookieHeader` needs
  // the whole header to see the duplicate-cookie case that a per-name lookup
  // silently collapses, and it forwards nothing but `red_session` upstream.
  const cookieHeader = (await headers()).get("cookie");
  const billing = await fetchBillingOverview(cookieHeader);

  return (
    <Shell email={principal.email} breadcrumb="Your account">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Your account</h1>
          <p className="mt-1 select-content text-sm text-text-secondary">
            Signed in as {principal.email}
          </p>
        </div>

        <BillingPanel
          subscriptions={billing.subscriptions}
          invoices={billing.invoices}
          unavailable={billing.unavailable}
          accountsUrl={getConfig().accountsUrl}
        />
      </div>
    </Shell>
  );
}
