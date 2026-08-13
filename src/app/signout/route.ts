import { clearSessionCookies } from "@redbtn/redauth/next";

import { getConfig } from "@/lib/config";

/**
 * Sign out of the ecosystem session.
 *
 * SIGN-OUT IS POST-ONLY, AND THAT IS LOAD-BEARING.
 *
 * This used to clear the session on GET, reached from a `<Link href="/signout">`
 * in the header. Next.js prefetches every in-viewport `<Link>`, so the browser
 * fired `GET /signout?_rsc=…` as soon as ANY signed-in page rendered — and the
 * response carried `red_session=; Max-Age=0; Domain=.redbtn.io`. Merely looking
 * at redBook destroyed the caller's session, and because the cookie is the
 * shared ecosystem one, it signed them out of every other redApp at the same
 * time. The next click then bounced to central sign-in, which is what a user
 * experiences as "every click sends me back to the login page".
 *
 * The general rule this encodes: a GET must never mutate. Prefetchers, link
 * scanners, and browser preloading all issue GETs nobody clicked.
 *
 * `clearSessionCookies` returns TWO Set-Cookie headers on purpose: the shared
 * `.redbtn.io` domain cookie and a host-only one. A stale host-only cookie
 * shadows the domain cookie, so clearing only one leaves the user apparently
 * signed in. Each header is appended raw rather than set through the cookies
 * API, because mixing the two makes Next re-serialize the list and rewrite the
 * session header.
 */
export const dynamic = "force-dynamic";

/**
 * The real sign-out. Reached only from the header's `<form method="post">`,
 * which no prefetcher will ever fire on its own.
 *
 * 303 rather than 302 so the redirect that follows is unambiguously a GET.
 */
export async function POST(): Promise<Response> {
  const config = getConfig();
  const headers = new Headers({ Location: config.accountsUrl, "cache-control": "no-store" });
  for (const cookie of clearSessionCookies()) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

/**
 * Deliberately inert: sends you home and clears NOTHING.
 *
 * A bookmark or a typed URL still lands somewhere sensible, and a prefetch
 * costs a redirect instead of the caller's session.
 */
export async function GET(): Promise<Response> {
  const config = getConfig();
  return new Response(null, {
    status: 303,
    headers: { Location: `${config.publicUrl}/`, "cache-control": "no-store" },
  });
}
