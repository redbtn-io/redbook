import "server-only";

import { getConfig } from "@/lib/config";
import { resolveJwtSecret } from "@/lib/secrets";
import { headerBagFromRequest, resolvePrincipal, type Principal } from "@/lib/session";
import { ensureSeeded } from "@/lib/seed";
import { logError } from "@/lib/logging";

/**
 * The single authenticated entry point for every CRM route.
 *
 * Centralizing this is the point: a route cannot forget to authenticate,
 * cannot forget to scope reads to the caller, and cannot leak an internal
 * error message to the client, because it never sees the request until all
 * three are handled.
 */

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

/**
 * Authenticate, make sure the caller's book has its starter data, then run the
 * handler. Any throw becomes a generic 500: driver and network errors carry
 * hostnames and credential-bearing URIs that must not reach a client.
 */
export async function withPrincipal(
  request: Request,
  handler: (principal: Principal) => Promise<Response>,
): Promise<Response> {
  const auth = await authenticate(request);
  if (!auth.ok) return auth.response;

  try {
    await ensureSeeded(auth.principal);
    return await handler(auth.principal);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logError("CRM request failed", { url: request.url, method: request.method, error: message });
    return errorResponse(500, "Internal Server Error");
  }
}
