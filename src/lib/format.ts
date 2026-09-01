import type { ClientStatus, InteractionType } from "@/lib/crm";

export const STATUS_LABELS: Record<ClientStatus, string> = {
  prospect: "Prospect",
  active: "Active",
  at_risk: "At risk",
  churned: "Churned",
};

/** Maps a client status onto redstyle's semantic Badge variants. */
export const STATUS_VARIANTS: Record<ClientStatus, "default" | "success" | "warning" | "error" | "info" | "secondary"> = {
  prospect: "info",
  active: "success",
  at_risk: "warning",
  churned: "error",
};

export const INTERACTION_LABELS: Record<InteractionType, string> = {
  call: "Call",
  meeting: "Meeting",
  email: "Email",
  conversation: "Conversation",
  other: "Other",
};

/**
 * Dates render in UTC deliberately. A date-only value stored as a UTC
 * midnight instant reads as the previous day for anyone west of UTC if it is
 * formatted in local time — the day-marker trap that has bitten other apps in
 * the fleet.
 */
export function formatDate(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

export function formatCurrency(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/**
 * Money that arrives from Stripe, which counts in minor units.
 *
 * Kept separate from `formatCurrency` above: that one renders ARR, a whole-
 * dollar sales figure, while a billing amount is an exact charge and must show
 * its cents. Dividing by 100 unconditionally is correct for the currencies
 * redbtn bills in (usd/eur/gbp); a zero-decimal currency such as JPY would
 * need a real minor-unit table, which is worth adding the day one appears
 * rather than guessing at it now.
 */
export function formatMoneyFromCents(amountCents?: number | null, currency = "usd"): string {
  if (typeof amountCents !== "number" || !Number.isFinite(amountCents)) return "—";
  try {
    return (amountCents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    // An unknown currency code throws inside Intl rather than falling back.
    return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/** "/month", "/year" — the suffix on a recurring price. */
export function formatInterval(interval?: string | null): string {
  if (!interval) return "";
  return `/${interval}`;
}

/** "in 72 days" / "21 days ago", for renewal and recency cues. */
export function relativeDays(iso?: string, now: Date = new Date()): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const days = Math.round((date.getTime() - now.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days > 0) return `in ${days} day${days === 1 ? "" : "s"}`;
  const past = Math.abs(days);
  return `${past} day${past === 1 ? "" : "s"} ago`;
}
