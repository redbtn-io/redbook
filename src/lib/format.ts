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
