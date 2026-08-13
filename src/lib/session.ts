import { timingSafeEqual } from "node:crypto";

import { verifyJWT, verifySessionCookie, type JWTPayload } from "@redbtn/redauth";

/**
 * Session verification for redBook.
 *
 * redBook is an internal redbtn app, so it rides the SHARED ecosystem
 * `red_session` cookie minted by accounts.redbtn.io and signed with the
 * shared `JWT_SECRET`. redBook only ever VERIFIES — it never mints a session,
 * and it never accepts an identity asserted by a plain client header.
 */

export interface Principal {
  userId: string;
  email: string;
  accountLevel?: number;
  sid?: string;
  /** How this principal was proven. Useful in logs and /api/me. */
  via: "cookie" | "bearer" | "internal";
}

export interface ResolveOptions {
  jwtSecret?: string;
  cookieName?: string;
  /** Enables the X-User-Id + X-Internal-Key service transport. */
  internalServiceKey?: string;
}

export type AuthResult =
  | { ok: true; principal: Principal }
  | { ok: false; status: 401 | 503; error: string };

export interface HeaderBag {
  authorization?: string | null;
  cookie?: string | null;
  "x-user-id"?: string | null;
  "x-internal-key"?: string | null;
}

function principalFromPayload(payload: JWTPayload | null, via: Principal["via"]): Principal | null {
  if (!payload || typeof payload.userId !== "string" || typeof payload.email !== "string") return null;
  if (!payload.userId || !payload.email) return null;
  const accountLevel =
    typeof payload.accountLevel === "number" && Number.isFinite(payload.accountLevel)
      ? payload.accountLevel
      : undefined;
  return {
    userId: payload.userId,
    email: payload.email,
    ...(accountLevel === undefined ? {} : { accountLevel }),
    ...(payload.sid === undefined ? {} : { sid: payload.sid }),
    via,
  };
}

function constantTimeEquals(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, "utf8");
    const right = Buffer.from(b, "utf8");
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

/**
 * Resolve the caller's identity from exactly the transports redBook trusts,
 * in priority order. Each transport fails CLOSED: a present-but-invalid
 * Authorization header never falls through to an ambient cookie, because
 * that fallback is how a stale bearer token silently borrows a browser
 * session that happens to be attached to the same request.
 */
export function resolvePrincipal(headers: HeaderBag, options: ResolveOptions): AuthResult {
  if (!options.jwtSecret) {
    return { ok: false, status: 503, error: "Authentication is not configured" };
  }

  const authorization = headers.authorization ?? null;
  if (authorization !== null && authorization !== "") {
    const match = /^Bearer\s+(\S+)$/i.exec(authorization);
    const principal = match ? principalFromPayload(verifyJWT(match[1], options.jwtSecret), "bearer") : null;
    return principal
      ? { ok: true, principal }
      : { ok: false, status: 401, error: "Not authenticated" };
  }

  // Service-to-service transport: a trusted caller that already knows which
  // user it is acting for. Gated on INTERNAL_SERVICE_KEY being configured;
  // absent that, these headers are inert and cannot assert an identity.
  const internalUserId = headers["x-user-id"] ?? null;
  const internalKey = headers["x-internal-key"] ?? null;
  if (internalUserId && internalKey) {
    if (options.internalServiceKey && constantTimeEquals(internalKey, options.internalServiceKey)) {
      return {
        ok: true,
        principal: { userId: internalUserId, email: "internal@redbtn.io", via: "internal" },
      };
    }
    return { ok: false, status: 401, error: "Not authenticated" };
  }

  // `verifySessionCookie` is the hardened reader: it URI-decodes, rejects
  // duplicate/ambiguous cookies of the same name, and rejects non-HS256
  // algorithms. Hand-rolled cookie regexes are what produced the Safari
  // dangling-`;` session bug across the fleet.
  const principal = principalFromPayload(
    verifySessionCookie(headers.cookie ?? null, {
      cookieName: options.cookieName || "red_session",
      secret: options.jwtSecret,
    }),
    "cookie",
  );
  return principal ? { ok: true, principal } : { ok: false, status: 401, error: "Not authenticated" };
}

/** Adapter for the Web `Request`/`Headers` used by Next route handlers. */
export function headerBagFromRequest(request: Request): HeaderBag {
  return {
    authorization: request.headers.get("authorization"),
    cookie: request.headers.get("cookie"),
    "x-user-id": request.headers.get("x-user-id"),
    "x-internal-key": request.headers.get("x-internal-key"),
  };
}
