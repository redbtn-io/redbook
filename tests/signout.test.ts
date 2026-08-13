import { beforeEach, describe, expect, it } from "vitest";

import { resetConfigCache } from "@/lib/config";

/**
 * Regression cover for the sign-out prefetch outage.
 *
 * The header used to render `<Link href="/signout">` at a GET route that
 * cleared the session. Next.js prefetches in-viewport links, so every signed-in
 * page render fired `GET /signout?_rsc=…` and got back
 * `red_session=; Max-Age=0; Domain=.redbtn.io` — destroying the shared
 * ecosystem session across every redApp without anyone clicking anything.
 *
 * These tests assert the invariant that prevents it: only POST clears cookies.
 */

const ENV = {
  PUBLIC_URL: "https://book.redbtn.io",
  ACCOUNTS_URL: "https://accounts.redbtn.io",
  MONGODB_URI: "mongodb://127.0.0.1:27017/redbook",
  JWT_SECRET: "test-secret",
};

function clearsSession(response: Response): boolean {
  return response.headers
    .getSetCookie()
    .some((cookie) => /^red_session=;/.test(cookie) || /red_session=;/.test(cookie));
}

describe("/signout", () => {
  beforeEach(() => {
    Object.assign(process.env, ENV);
    resetConfigCache();
  });

  it("does NOT clear the session on GET, so a prefetch cannot sign anyone out", async () => {
    const { GET } = await import("@/app/signout/route");
    const response = await GET();

    expect(clearsSession(response)).toBe(false);
    expect(response.headers.get("Location")).toBe("https://book.redbtn.io/");
  });

  it("clears both session cookies on POST and returns to central sign-in", async () => {
    const { POST } = await import("@/app/signout/route");
    const response = await POST();

    const cookies = response.headers.getSetCookie();
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("https://accounts.redbtn.io");

    // Both the shared `.redbtn.io` cookie and the host-only one: a stale
    // host-only cookie shadows the domain cookie, so clearing one is not enough.
    expect(cookies.length).toBe(2);
    expect(cookies.some((cookie) => /Domain=\.redbtn\.io/i.test(cookie))).toBe(true);
    expect(cookies.some((cookie) => !/Domain=/i.test(cookie))).toBe(true);
    expect(cookies.every((cookie) => /red_session=;/.test(cookie))).toBe(true);
  });
});

describe("Shell sign-out control", () => {
  it("submits a form rather than rendering a prefetchable link", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/components/Shell.tsx", import.meta.url), "utf8"),
    );

    expect(source).toContain('method="post"');
    expect(source).toContain('action="/signout"');
    // The exact shape that caused the outage must not come back.
    expect(source).not.toMatch(/<Link\s[^>]*href="\/signout"/);
  });
});
