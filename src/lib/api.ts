import "server-only";

import { getConfig } from "@/lib/config";
import { resolveJwtSecret } from "@/lib/secrets";
import { headerBagFromRequest, resolvePrincipal, type Principal } from "@/lib/session";
import { isBookOrg, resolveActiveOrg } from "@/lib/redorg";
import { ensureSeeded } from "@/lib/seed";
import { logError, logWarn } from "@/lib/logging";
import type { OrgMembership } from "@/lib/authz";

/**
 * The single authenticated entry point for every CRM route.
 *
 * Centralizing this is the point: a route cannot forget to authenticate,
 * cannot forget to scope to an org, and cannot leak an internal error message
 * to the client, because it never sees the request until all three are done.
 */

export interface ApiContext {
  principal: Principal;
  membership: OrgMembership;
  memberships: OrgMembership[];
  request: Request;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function errorResponse(status: number, error: string): Response {
  return json({ error }, status);
}

/** Parse a JSON body, rejecting anything that is not valid JSON. */
export async function readJsonBody(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  const raw = await request.text();
  if (!raw) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, error: "Invalid JSON payload" };
  }
}

/** Verify the caller. Returns the principal or the response to send back. */
export async function authenticate(
  request: Request,
): Promise<{ ok: true; principal: Principal } | { ok: false; response: Response }> {
  const config = getConfig();
  const jwtSecret = await resolveJwtSecret(config);
  const result = resolvePrincipal(headerBagFromRequest(request), {
    jwtSecret: jwtSecret ?? undefined,
    cookieName: config.cookieName,
    internalServiceKey: config.internalServiceKey,
  });
  if (!result.ok) {
    if (result.status === 503) logError("Auth is not configured; JWT_SECRET is missing");
    return { ok: false, response: errorResponse(result.status, result.error) };
  }
  return { ok: true, principal: result.principal };
}

/** The cookie that remembers the caller's last used org, set by the switcher. */
export { ORG_COOKIE } from "@/lib/org-cookie";
import { ORG_COOKIE } from "@/lib/org-cookie";

/**
 * The org a request asks for, following the redSocial selection pattern:
 * `x-org` header first, then an `orgId` or `org` query parameter, then the
 * last-used-org cookie. The value may be an org id or a slug. It is only a
 * REQUEST: `resolveActiveOrg` still matches it against the caller's real
 * memberships before anything is served from it.
 */
export function orgRefFromRequest(request: Request): string | null {
  const header = request.headers.get("x-org");
  if (header?.trim()) return header.trim();
  const url = new URL(request.url);
  const query = url.searchParams.get("orgId") ?? url.searchParams.get("org");
  if (query?.trim()) return query.trim();
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.split("=");
    if (name?.trim() === ORG_COOKIE) {
      const value = decodeURIComponent(rest.join("=").trim());
      return value || null;
    }
  }
  return null;
}

/**
 * Authenticate, resolve the org this caller is acting in, make sure that org's
 * book has its starter data, then run the handler.
 *
 * An org supplied by the caller is honoured only after being matched
 * against that caller's real redOrg memberships — a mismatch is a 403, not a
 * silent fallback to their default org, so a cross-tenant attempt is visible
 * rather than quietly serving the wrong book.
 *
 * Any throw becomes a generic 500: driver and network errors carry hostnames
 * and credential-bearing URIs that must not reach a client.
 */
export async function withOrg(
  request: Request,
  handler: (context: ApiContext) => Promise<Response>,
): Promise<Response> {
  const auth = await authenticate(request);
  if (!auth.ok) return auth.response;

  try {
    const requestedOrgId = orgRefFromRequest(request);
    const resolved = await resolveActiveOrg(auth.principal, requestedOrgId);
    if (!resolved) {
      logWarn("Org access denied", { userId: auth.principal.userId, requestedOrgId });
      return errorResponse(403, "Forbidden");
    }
    // Starter data is seeded only into books redBook manages. The shared
    // directory also holds other apps' orgs, and seeding demo clients into
    // one of those would be vandalism, not integration.
    if (await isBookOrg(resolved.membership.orgId)) {
      await ensureSeeded(resolved.membership, auth.principal);
    }
    return await handler({
      principal: auth.principal,
      membership: resolved.membership,
      memberships: resolved.memberships,
      request,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logError("CRM request failed", { url: request.url, method: request.method, error: message });
    return errorResponse(500, "Internal Server Error");
  }
}

/**
 * Authenticate and resolve ONE named org for the caller, for routes that
 * live under that org (the members surface). The org must resolve to a real
 * membership and be the org named in the path; anything else is a 403.
 * Unlike `withOrg` this never seeds: member management is not book content.
 */
export async function withOrgScope(
  request: Request,
  orgId: string,
  handler: (context: ApiContext) => Promise<Response>,
): Promise<Response> {
  const auth = await authenticate(request);
  if (!auth.ok) return auth.response;

  try {
    const resolved = await resolveActiveOrg(auth.principal, orgId);
    if (!resolved || resolved.membership.orgId !== orgId) {
      logWarn("Org scope denied", { userId: auth.principal.userId, orgId });
      return errorResponse(403, "Forbidden");
    }
    return await handler({
      principal: auth.principal,
      membership: resolved.membership,
      memberships: resolved.memberships,
      request,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logError("Org-scoped request failed", { url: request.url, method: request.method, error: message });
    return errorResponse(500, "Internal Server Error");
  }
}
