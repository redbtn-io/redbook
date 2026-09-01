import "server-only";

import { getConfig, type RuntimeConfig } from "@/lib/config";
import { logWarn } from "@/lib/logging";

/**
 * The signed-in user's billing relationship with **redbtn** — their own
 * subscription and invoices for redbtn services.
 *
 * THIS IS PERSONAL, NOT ORG DATA. Nothing here is scoped by, filtered by, or
 * shared with a redBook org: it is what this human pays redbtn, and it is
 * rendered only on `/account`, a surface no other org member sees. Org-facing
 * payments (a redBook org billing its OWN clients) are a different product
 * entirely and deliberately unbuilt — see `docs/PLATFORM-BILLING.md`.
 *
 * ## Why redBook proxies instead of the browser calling billing directly
 *
 * billing.redbtn.io's CORS allowlist admits `accounts.redbtn.io` and nothing
 * else, so a `fetch` from a book.redbtn.io page is blocked before it starts.
 * CORS is a browser policy, not an authorization boundary — a server-to-server
 * call is unaffected by it. So redBook calls billing from the server and
 * forwards EXACTLY ONE thing: the caller's own `red_session` cookie.
 *
 * That single forwarded cookie is the whole security model, and its
 * properties are worth stating plainly:
 *
 *  - No service key, no internal key, no admin credential and no `X-User-Id`
 *    ever goes upstream. redBook therefore cannot ask billing for anyone
 *    else's data even if a bug tried to: it has no credential that would let
 *    it, and billing only ever answers for the session it was handed.
 *  - Per-user isolation is INHERITED from redbilling's own auth rather than
 *    re-implemented here. There is no place in this file where a user id is
 *    chosen, so there is no place where the wrong one can be chosen.
 *  - Only `red_session` is forwarded — never the raw `Cookie` header. The
 *    browser sends every `.redbtn.io` cookie it holds to redBook, and
 *    relaying that whole jar to another service would leak unrelated app
 *    cookies for no benefit.
 */

export const BILLING_TIMEOUT_MS = 10_000;

export interface BillingSubscription {
  id: string;
  status: string;
  productName: string;
  amountCents: number | null;
  currency: string;
  interval: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface BillingInvoice {
  id: string;
  number: string | null;
  status: string;
  amountPaid: number | null;
  amountDue: number | null;
  currency: string;
  created: string | null;
  nextAttemptAt: string | null;
  hostedUrl: string | null;
}

/** Why a billing lookup could not be answered. Never a raw upstream message. */
export type BillingUnavailableReason =
  | "no_session_cookie"
  | "upstream_unauthenticated"
  | "upstream_error"
  | "timeout";

export type BillingResult<T> =
  | { status: "ok"; data: T }
  | { status: "unavailable"; reason: BillingUnavailableReason };

// --------------------------------------------------------------- the cookie

/**
 * Rebuild a `Cookie` header carrying the caller's `red_session` and nothing
 * else.
 *
 * Duplicates are refused rather than resolved, matching `verifySessionCookie`:
 * when two cookies of the same name are present nobody can say which one the
 * user meant, and picking one is how a stale host-only cookie shadows the real
 * shared session. Returning `null` degrades to "billing unavailable", which is
 * the safe direction.
 */
export function sessionCookieHeader(
  cookieHeader: string | null | undefined,
  cookieName = "red_session",
): string | null {
  if (!cookieHeader) return null;

  const values: string[] = [];
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    if (name !== cookieName) continue;
    const value = part.slice(separator + 1).trim();
    if (value) values.push(value);
  }

  if (values.length !== 1) return null;
  return `${cookieName}=${values[0]}`;
}

// ---------------------------------------------------------------- normalize

/**
 * Upstream payloads are normalized defensively rather than cast.
 *
 * redbilling is a separately deployed service on a live Stripe account: a
 * field can gain a null, change shape, or disappear between deploys. A cast
 * would turn that into a render-time crash on a page the user opened to look
 * at something else, so every field is checked and anything unusable becomes
 * `null` for the UI to render as "—".
 */
function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function readIsoDate(value: unknown): string | null {
  const raw = readString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function normalizeSubscription(raw: unknown): BillingSubscription | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = readString(record.id);
  if (!id) return null;
  return {
    id,
    status: readString(record.status) ?? "unknown",
    productName: readString(record.productName) ?? "redbtn subscription",
    amountCents: readInteger(record.amountCents),
    currency: (readString(record.currency) ?? "usd").toLowerCase(),
    interval: readString(record.interval),
    currentPeriodEnd: readIsoDate(record.currentPeriodEnd),
    cancelAtPeriodEnd: record.cancelAtPeriodEnd === true,
  };
}

export function normalizeInvoice(raw: unknown): BillingInvoice | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = readString(record.id);
  if (!id) return null;
  return {
    id,
    number: readString(record.number),
    status: readString(record.status) ?? "unknown",
    amountPaid: readInteger(record.amountPaid),
    amountDue: readInteger(record.amountDue),
    currency: (readString(record.currency) ?? "usd").toLowerCase(),
    created: readIsoDate(record.created),
    nextAttemptAt: readIsoDate(record.nextAttemptAt),
    hostedUrl: readString(record.hostedUrl),
  };
}

// ------------------------------------------------------------ presentation

export interface InvoicePresentation {
  label: string;
  /** redstyle Badge variant. */
  variant: "default" | "success" | "warning" | "error" | "info" | "secondary";
  /** Amount to show: what was paid, or what is owed on anything unpaid. */
  amountCents: number | null;
  /** "Charged" / "Due" / "Issued" — what the date next to it means. */
  dateLabel: string;
  date: string | null;
  upcoming: boolean;
}

/**
 * How one invoice reads to a human.
 *
 * A Stripe invoice in `draft` has not been charged yet — it is the NEXT
 * charge, accruing until it finalizes. Showing it as "Draft" invites the
 * reading "something is wrong with my invoice", so it is labelled **Upcoming**
 * and dated by `nextAttemptAt` when Stripe has told us when it will be
 * attempted.
 */
export function invoicePresentation(invoice: BillingInvoice): InvoicePresentation {
  switch (invoice.status) {
    case "draft":
      return {
        label: "Upcoming",
        variant: "info",
        amountCents: invoice.amountDue,
        dateLabel: "Charges",
        date: invoice.nextAttemptAt ?? invoice.created,
        upcoming: true,
      };
    case "open":
      return {
        label: "Due",
        variant: "warning",
        amountCents: invoice.amountDue,
        dateLabel: invoice.nextAttemptAt ? "Retries" : "Issued",
        date: invoice.nextAttemptAt ?? invoice.created,
        upcoming: false,
      };
    case "paid":
      return {
        label: "Paid",
        variant: "success",
        amountCents: invoice.amountPaid,
        dateLabel: "Charged",
        date: invoice.created,
        upcoming: false,
      };
    case "uncollectible":
      return {
        label: "Uncollectible",
        variant: "error",
        amountCents: invoice.amountDue,
        dateLabel: "Issued",
        date: invoice.created,
        upcoming: false,
      };
    case "void":
      return {
        label: "Void",
        variant: "secondary",
        amountCents: invoice.amountDue,
        dateLabel: "Issued",
        date: invoice.created,
        upcoming: false,
      };
    default:
      return {
        label: invoice.status,
        variant: "secondary",
        amountCents: invoice.amountDue ?? invoice.amountPaid,
        dateLabel: "Issued",
        date: invoice.created,
        upcoming: false,
      };
  }
}

/** Subscription status onto a redstyle Badge variant. */
export function subscriptionVariant(status: string): InvoicePresentation["variant"] {
  switch (status) {
    case "active":
    case "trialing":
      return "success";
    case "past_due":
    case "unpaid":
      return "warning";
    case "canceled":
    case "incomplete_expired":
      return "error";
    default:
      return "secondary";
  }
}

// ----------------------------------------------------------------- fetching

/**
 * One upstream GET, carrying only the caller's session cookie.
 *
 * Time-boxed: billing is a nice-to-have panel on someone else's page, so a
 * slow or wedged upstream must not hold a redBook render open. An abort, a
 * network error and a 5xx all land in the same place — "unavailable" — and
 * the caller renders a one-line notice instead of failing.
 */
async function get(
  path: string,
  cookieHeader: string | null | undefined,
  config: RuntimeConfig,
): Promise<BillingResult<unknown>> {
  const cookie = sessionCookieHeader(cookieHeader, config.cookieName);
  if (!cookie) return { status: "unavailable", reason: "no_session_cookie" };

  let response: Response;
  try {
    response = await fetch(`${config.billingUrl}${path}`, {
      method: "GET",
      // Exactly two headers. No credential of redBook's own travels with this
      // request, so it can only ever return the caller's own data.
      headers: { cookie, accept: "application/json" },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(BILLING_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    logWarn("redbtn billing request failed", { path, error: timedOut ? "timeout" : "network" });
    return { status: "unavailable", reason: timedOut ? "timeout" : "upstream_error" };
  }

  if (response.status === 401 || response.status === 403) {
    return { status: "unavailable", reason: "upstream_unauthenticated" };
  }
  if (!response.ok) {
    logWarn("redbtn billing returned an error", { path, status: response.status });
    return { status: "unavailable", reason: "upstream_error" };
  }

  try {
    return { status: "ok", data: await response.json() };
  } catch {
    logWarn("redbtn billing returned an unreadable body", { path });
    return { status: "unavailable", reason: "upstream_error" };
  }
}

function listOf(payload: unknown, key: string): unknown[] {
  if (!payload || typeof payload !== "object") return [];
  const value = (payload as Record<string, unknown>)[key];
  return Array.isArray(value) ? value : [];
}

export async function fetchSubscriptions(
  cookieHeader: string | null | undefined,
  config: RuntimeConfig = getConfig(),
): Promise<BillingResult<BillingSubscription[]>> {
  const result = await get("/api/subscriptions", cookieHeader, config);
  if (result.status !== "ok") return result;
  return {
    status: "ok",
    data: listOf(result.data, "subscriptions")
      .map(normalizeSubscription)
      .filter((subscription): subscription is BillingSubscription => subscription !== null),
  };
}

export async function fetchInvoices(
  cookieHeader: string | null | undefined,
  config: RuntimeConfig = getConfig(),
): Promise<BillingResult<BillingInvoice[]>> {
  const result = await get("/api/invoices", cookieHeader, config);
  if (result.status !== "ok") return result;
  return {
    status: "ok",
    data: listOf(result.data, "invoices")
      .map(normalizeInvoice)
      .filter((invoice): invoice is BillingInvoice => invoice !== null),
  };
}

export interface BillingOverview {
  subscriptions: BillingSubscription[];
  invoices: BillingInvoice[];
  /** True when neither lookup could be answered. */
  unavailable: boolean;
}

/**
 * Everything the panel needs, in one round trip's worth of latency.
 *
 * Partial failure is tolerated on purpose: a user whose subscriptions load
 * but whose invoices time out should still be told what they are paying for.
 */
export async function fetchBillingOverview(
  cookieHeader: string | null | undefined,
  config: RuntimeConfig = getConfig(),
): Promise<BillingOverview> {
  const [subscriptions, invoices] = await Promise.all([
    fetchSubscriptions(cookieHeader, config),
    fetchInvoices(cookieHeader, config),
  ]);
  return {
    subscriptions: subscriptions.status === "ok" ? subscriptions.data : [],
    invoices: invoices.status === "ok" ? invoices.data : [],
    unavailable: subscriptions.status !== "ok" && invoices.status !== "ok",
  };
}
