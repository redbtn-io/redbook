import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchInvoices,
  fetchSubscriptions,
  invoicePresentation,
  normalizeInvoice,
  normalizeSubscription,
  sessionCookieHeader,
} from "@/lib/billing";
import { loadRuntimeConfig } from "@/lib/config";
import { formatMoneyFromCents } from "@/lib/format";

const CONFIG = loadRuntimeConfig({
  MONGODB_URI: "mongodb://127.0.0.1:27017/redbook",
  JWT_SECRET: "test-secret",
  BILLING_URL: "https://billing.example.test",
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("sessionCookieHeader", () => {
  it("forwards the session cookie and nothing else", () => {
    // The browser hands redBook every .redbtn.io cookie it holds. Relaying
    // that whole jar to another service would leak unrelated app cookies.
    const header = sessionCookieHeader(
      "theme=dark; red_session=abc.def.ghi; redrun_prefs=x; _ga=GA1.1.9",
    );
    expect(header).toBe("red_session=abc.def.ghi");
  });

  it("returns null when there is no session cookie to forward", () => {
    expect(sessionCookieHeader("theme=dark")).toBeNull();
    expect(sessionCookieHeader("")).toBeNull();
    expect(sessionCookieHeader(null)).toBeNull();
    expect(sessionCookieHeader("red_session=")).toBeNull();
  });

  it("refuses to guess between duplicate session cookies", () => {
    // Matches verifySessionCookie: when a host-only cookie shadows the shared
    // one, picking either is how a stale session gets used.
    expect(sessionCookieHeader("red_session=one; red_session=two")).toBeNull();
  });

  it("honours a non-default cookie name", () => {
    expect(sessionCookieHeader("other=v", "other")).toBe("other=v");
  });
});

describe("normalizeSubscription", () => {
  it("reads the live redbilling shape", () => {
    expect(
      normalizeSubscription({
        id: "sub_1UAgfq2KueIEaG052oJq0xOG",
        status: "active",
        productName: "Become Platform Services",
        amountCents: 10000,
        currency: "usd",
        interval: "month",
        currentPeriodEnd: "2026-10-01T04:00:00.000Z",
        cancelAtPeriodEnd: false,
      }),
    ).toEqual({
      id: "sub_1UAgfq2KueIEaG052oJq0xOG",
      status: "active",
      productName: "Become Platform Services",
      amountCents: 10000,
      currency: "usd",
      interval: "month",
      currentPeriodEnd: "2026-10-01T04:00:00.000Z",
      cancelAtPeriodEnd: false,
    });
  });

  it("survives a missing or reshaped field rather than crashing the page", () => {
    const subscription = normalizeSubscription({ id: "sub_1", amountCents: null, currency: null });
    expect(subscription).toMatchObject({
      id: "sub_1",
      status: "unknown",
      productName: "redbtn subscription",
      amountCents: null,
      currency: "usd",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
  });

  it("drops an entry with no id, and anything that is not an object", () => {
    expect(normalizeSubscription({ status: "active" })).toBeNull();
    expect(normalizeSubscription("sub_1")).toBeNull();
    expect(normalizeSubscription(null)).toBeNull();
  });

  it("rejects an unparseable date instead of rendering Invalid Date", () => {
    expect(normalizeSubscription({ id: "sub_1", currentPeriodEnd: "soon" })?.currentPeriodEnd).toBeNull();
  });
});

describe("normalizeInvoice", () => {
  it("reads the live redbilling shape", () => {
    expect(
      normalizeInvoice({
        id: "in_1UAitX2KueIEaG05KNQZW3rW",
        number: "GRD6T0BV-0002",
        status: "open",
        amountPaid: 0,
        amountDue: 10000,
        currency: "usd",
        created: "2026-09-01T04:01:59.000Z",
        nextAttemptAt: null,
        hostedUrl: "https://invoice.stripe.com/i/acct_x/live_y",
      }),
    ).toMatchObject({
      id: "in_1UAitX2KueIEaG05KNQZW3rW",
      number: "GRD6T0BV-0002",
      status: "open",
      amountDue: 10000,
      created: "2026-09-01T04:01:59.000Z",
      nextAttemptAt: null,
    });
  });
});

describe("invoicePresentation", () => {
  const base = {
    id: "in_1",
    number: "0001",
    amountPaid: 0,
    amountDue: 10000,
    currency: "usd",
    created: "2026-09-01T04:01:59.000Z",
    nextAttemptAt: null,
    hostedUrl: null,
  };

  it("calls a draft invoice UPCOMING, dated by the attempt Stripe scheduled", () => {
    // A draft has not been charged. Showing the word "draft" reads as
    // "something is wrong with my invoice" rather than "this is next".
    const presentation = invoicePresentation({
      ...base,
      status: "draft",
      nextAttemptAt: "2026-10-01T04:00:00.000Z",
    });
    expect(presentation.label).toBe("Upcoming");
    expect(presentation.upcoming).toBe(true);
    expect(presentation.dateLabel).toBe("Charges");
    expect(presentation.date).toBe("2026-10-01T04:00:00.000Z");
    expect(presentation.amountCents).toBe(10000);
  });

  it("falls back to the creation date when a draft has no scheduled attempt", () => {
    const presentation = invoicePresentation({ ...base, status: "draft" });
    expect(presentation.label).toBe("Upcoming");
    expect(presentation.date).toBe(base.created);
  });

  it("shows what was actually paid on a paid invoice", () => {
    const presentation = invoicePresentation({
      ...base,
      status: "paid",
      amountPaid: 10000,
      amountDue: 0,
    });
    expect(presentation).toMatchObject({ label: "Paid", variant: "success", amountCents: 10000 });
  });

  it("shows what is owed on an open invoice", () => {
    expect(invoicePresentation({ ...base, status: "open" })).toMatchObject({
      label: "Due",
      variant: "warning",
      amountCents: 10000,
      upcoming: false,
    });
  });

  it("passes an unrecognised status through rather than mislabelling it", () => {
    expect(invoicePresentation({ ...base, status: "something_new" }).label).toBe("something_new");
  });
});

describe("fetchSubscriptions / fetchInvoices", () => {
  it("sends ONLY the session cookie upstream — no service key, no other cookie", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ subscriptions: [{ id: "sub_1" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchSubscriptions("red_session=tok; other=leak", CONFIG);

    expect(result).toMatchObject({ status: "ok" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://billing.example.test/api/subscriptions");
    // The entire header set. Per-user isolation is inherited from redbilling's
    // own auth precisely because redBook sends it no credential of its own.
    expect(init.headers).toEqual({ cookie: "red_session=tok", accept: "application/json" });
    expect(JSON.stringify(init.headers)).not.toContain("leak");
  });

  it("never calls upstream when there is no cookie to forward", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchInvoices(null, CONFIG)).toEqual({
      status: "unavailable",
      reason: "no_session_cookie",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports an upstream 401 as unavailable rather than as an empty account", async () => {
    // "You have no subscription" and "billing did not answer" must not be the
    // same answer: one of them tells a paying customer they have no plan.
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "Sign in first." }, 401)));
    expect(await fetchSubscriptions("red_session=tok", CONFIG)).toEqual({
      status: "unavailable",
      reason: "upstream_unauthenticated",
    });
  });

  it("degrades to unavailable on an upstream 5xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 502 })));
    expect(await fetchInvoices("red_session=tok", CONFIG)).toEqual({
      status: "unavailable",
      reason: "upstream_error",
    });
  });

  it("degrades to unavailable when the upstream call times out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" });
      }),
    );
    expect(await fetchSubscriptions("red_session=tok", CONFIG)).toEqual({
      status: "unavailable",
      reason: "timeout",
    });
  });

  it("degrades to unavailable when the body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>gateway</html>", { status: 200 })));
    expect(await fetchInvoices("red_session=tok", CONFIG)).toEqual({
      status: "unavailable",
      reason: "upstream_error",
    });
  });

  it("returns an empty list for an account with no billing history", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ subscriptions: [] })));
    expect(await fetchSubscriptions("red_session=tok", CONFIG)).toEqual({ status: "ok", data: [] });
  });

  it("tolerates a payload that is not the expected shape", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ subscriptions: "nope" })));
    expect(await fetchSubscriptions("red_session=tok", CONFIG)).toEqual({ status: "ok", data: [] });
  });
});

describe("formatMoneyFromCents", () => {
  it("renders Stripe minor units with cents", () => {
    expect(formatMoneyFromCents(10000, "usd")).toBe("$100.00");
    expect(formatMoneyFromCents(999, "usd")).toBe("$9.99");
    expect(formatMoneyFromCents(0, "usd")).toBe("$0.00");
  });

  it("renders an em dash for a missing amount", () => {
    expect(formatMoneyFromCents(null)).toBe("—");
    expect(formatMoneyFromCents(undefined)).toBe("—");
    expect(formatMoneyFromCents(Number.NaN)).toBe("—");
  });

  it("renders an unrecognised but well-formed currency with its code", () => {
    // Intl separates the code with a NON-BREAKING space, so normalize before
    // comparing rather than pasting an invisible character into the test.
    expect(formatMoneyFromCents(1000, "zzz").replace(/\s/g, " ")).toBe("ZZZ 10.00");
  });

  it("does not throw on a malformed currency code", () => {
    // Intl throws a RangeError rather than degrading, and a garbled currency
    // must not be the reason an account page 500s.
    expect(formatMoneyFromCents(1000, "z")).toBe("10.00 Z");
  });
});

describe("billing config", () => {
  it("defaults to the ecosystem billing service", () => {
    expect(loadRuntimeConfig({}).billingUrl).toBe("https://billing.redbtn.io");
  });

  it("takes an override without a trailing slash", () => {
    expect(loadRuntimeConfig({ BILLING_URL: "https://billing.example.test/" }).billingUrl).toBe(
      "https://billing.example.test",
    );
  });
});
