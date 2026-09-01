import { authenticate, errorResponse, json } from "@/lib/api";
import { fetchSubscriptions } from "@/lib/billing";

/**
 * The CALLER's own redbtn subscriptions, proxied from billing.redbtn.io.
 *
 * Not `withOrg`: this is personal billing, so an org has no say in it. The
 * route authenticates the caller and then forwards nothing but that caller's
 * `red_session` cookie upstream, which is why it cannot return anyone else's
 * subscription — redBook holds no credential that would let it ask for one.
 *
 * An upstream problem is a 502, not an empty list. "No subscriptions" and
 * "billing did not answer" are different facts and a client that cannot tell
 * them apart would tell a paying customer they have no plan.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if (!auth.ok) return auth.response;

  const result = await fetchSubscriptions(request.headers.get("cookie"));
  if (result.status !== "ok") {
    return json({ error: "Billing is unavailable", reason: result.reason }, 502);
  }
  return json({ subscriptions: result.data });
}

/** Reads only. Anything else is a mistake worth naming. */
export async function POST(): Promise<Response> {
  return errorResponse(405, "Method Not Allowed");
}
