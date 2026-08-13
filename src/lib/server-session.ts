import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getConfig, signInUrl } from "@/lib/config";
import { resolveJwtSecret } from "@/lib/secrets";
import { resolvePrincipal, type Principal } from "@/lib/session";

/**
 * Server-component session read. Resolved once per request with no client
 * fetch and no loading flash.
 *
 * This reads the raw `cookie` header rather than `cookies().get()` on purpose:
 * `verifySessionCookie` needs the whole header so it can reject the
 * duplicate-cookie case, which a per-name lookup silently collapses by
 * returning whichever copy the runtime happened to pick.
 */
export async function getPrincipal(): Promise<Principal | null> {
  const config = getConfig();
  const jwtSecret = await resolveJwtSecret(config).catch(() => null);
  if (!jwtSecret) return null;

  const headerList = await headers();
  const result = resolvePrincipal(
    {
      authorization: headerList.get("authorization"),
      cookie: headerList.get("cookie"),
      "x-user-id": headerList.get("x-user-id"),
      "x-internal-key": headerList.get("x-internal-key"),
    },
    {
      jwtSecret,
      cookieName: config.cookieName,
      internalServiceKey: config.internalServiceKey,
    },
  );
  return result.ok ? result.principal : null;
}

/**
 * Gate a page on a real session, bouncing to central sign-in with a `next`
 * that comes back here.
 *
 * The return URL is built from configured `publicUrl` plus the path, NOT from
 * the incoming request URL: behind redrouter-proxy the container sees its own
 * internal bind address as the host, so a return URL derived from the request
 * sends the browser somewhere unreachable.
 */
export async function requirePrincipal(returnPath = "/"): Promise<Principal> {
  const principal = await getPrincipal();
  if (!principal) redirect(signInUrl(getConfig(), returnPath));
  return principal;
}
