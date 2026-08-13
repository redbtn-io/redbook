import { clearSessionCookies } from "@redbtn/redauth/next";

import { getConfig } from "@/lib/config";

/**
 * Sign out of the ecosystem session.
 *
 * `clearSessionCookies` returns TWO Set-Cookie headers on purpose: the shared
 * `.redbtn.io` domain cookie and a host-only one. A stale host-only cookie
 * shadows the domain cookie, so clearing only one leaves the user apparently
 * signed in. Each header is appended raw rather than set through the cookies
 * API, because mixing the two makes Next re-serialize the list and rewrite the
 * session header.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const config = getConfig();
  const headers = new Headers({ Location: config.accountsUrl, "cache-control": "no-store" });
  for (const cookie of clearSessionCookies()) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}
