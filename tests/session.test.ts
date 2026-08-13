import { describe, expect, it } from "vitest";
import { createJWT } from "@redbtn/redauth";

import { resolvePrincipal } from "@/lib/session";

const SECRET = "test-secret-value";
const OTHER_SECRET = "a-different-secret";

function token(payload: { userId: string; email: string }, secret = SECRET, ttl = 3600): string {
  return createJWT(payload, secret, ttl);
}

const VALID = { userId: "user-1", email: "josh@example.com" };

describe("resolvePrincipal", () => {
  it("reports 503 when no signing secret is configured, rather than allowing access", () => {
    const result = resolvePrincipal({ cookie: `red_session=${token(VALID)}` }, {});
    expect(result).toEqual({ ok: false, status: 503, error: "Authentication is not configured" });
  });

  it("accepts a valid red_session cookie", () => {
    const result = resolvePrincipal({ cookie: `red_session=${token(VALID)}` }, { jwtSecret: SECRET });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.principal.userId).toBe("user-1");
      expect(result.principal.email).toBe("josh@example.com");
      expect(result.principal.via).toBe("cookie");
    }
  });

  it("accepts a valid Bearer token", () => {
    const result = resolvePrincipal(
      { authorization: `Bearer ${token(VALID)}` },
      { jwtSecret: SECRET },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.principal.via).toBe("bearer");
  });

  it("rejects a cookie signed with a different secret", () => {
    const result = resolvePrincipal(
      { cookie: `red_session=${token(VALID, OTHER_SECRET)}` },
      { jwtSecret: SECRET },
    );
    expect(result).toEqual({ ok: false, status: 401, error: "Not authenticated" });
  });

  it("rejects an expired token", () => {
    const result = resolvePrincipal(
      { cookie: `red_session=${token(VALID, SECRET, -60)}` },
      { jwtSecret: SECRET },
    );
    expect(result.ok).toBe(false);
  });

  it("does NOT fall back to a valid cookie when the Bearer header is invalid", () => {
    // The whole point: a stale bearer token must not silently borrow whatever
    // browser session happens to be attached to the same request.
    const result = resolvePrincipal(
      { authorization: "Bearer not-a-real-token", cookie: `red_session=${token(VALID)}` },
      { jwtSecret: SECRET },
    );
    expect(result).toEqual({ ok: false, status: 401, error: "Not authenticated" });
  });

  it("rejects duplicate red_session cookies instead of picking one", () => {
    const result = resolvePrincipal(
      { cookie: `red_session=${token(VALID)}; red_session=${token(VALID, OTHER_SECRET)}` },
      { jwtSecret: SECRET },
    );
    expect(result.ok).toBe(false);
  });

  it("ignores a session cookie under a different name", () => {
    const result = resolvePrincipal(
      { cookie: `other_session=${token(VALID)}` },
      { jwtSecret: SECRET },
    );
    expect(result.ok).toBe(false);
  });

  it("never trusts an identity asserted by headers alone", () => {
    const result = resolvePrincipal(
      { "x-user-id": "attacker", "x-internal-key": "guess" },
      { jwtSecret: SECRET, internalServiceKey: "the-real-key" },
    );
    expect(result).toEqual({ ok: false, status: 401, error: "Not authenticated" });
  });

  it("ignores the internal transport entirely when no service key is configured", () => {
    const result = resolvePrincipal(
      { "x-user-id": "attacker", "x-internal-key": "anything" },
      { jwtSecret: SECRET },
    );
    expect(result.ok).toBe(false);
  });

  it("accepts the internal transport with the correct service key", () => {
    const result = resolvePrincipal(
      { "x-user-id": "user-9", "x-internal-key": "the-real-key" },
      { jwtSecret: SECRET, internalServiceKey: "the-real-key" },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.principal.userId).toBe("user-9");
      expect(result.principal.via).toBe("internal");
    }
  });

  it("rejects a token missing the claims a principal needs", () => {
    const result = resolvePrincipal(
      { authorization: `Bearer ${createJWT({ userId: "u", email: "" }, SECRET, 3600)}` },
      { jwtSecret: SECRET },
    );
    expect(result.ok).toBe(false);
  });
});
