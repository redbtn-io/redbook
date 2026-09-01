import { authenticate, errorResponse, json } from "@/lib/api";
import { fetchInvoices } from "@/lib/billing";

/**
 * The CALLER's own redbtn invoices, proxied from billing.redbtn.io.
 *
 * Same contract as the subscriptions route: personal (never org-scoped),
 * authenticated by redBook, then answered upstream against nothing but the
 * caller's forwarded `red_session` cookie.
 *
 * A `draft` invoice is Stripe's word for a charge that has not happened yet.
 * It is passed through as-is rather than filtered out, because the upcoming
 * charge is one of the two things a person opens this page to see; the UI
 * labels it "Upcoming" (`invoicePresentation`).
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if (!auth.ok) return auth.response;

  const result = await fetchInvoices(request.headers.get("cookie"));
  if (result.status !== "ok") {
    return json({ error: "Billing is unavailable", reason: result.reason }, 502);
  }
  return json({ invoices: result.data });
}

/** Reads only. Anything else is a mistake worth naming. */
export async function POST(): Promise<Response> {
  return errorResponse(405, "Method Not Allowed");
}
