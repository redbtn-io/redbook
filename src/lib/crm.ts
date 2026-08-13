/**
 * The CRM domain: clients, contacts, notes, interactions.
 *
 * Shape note for the coaching/QBR layer that comes later: the fields an AI
 * would need to reason over are deliberately FREEFORM and first-class —
 * `Note.body`, `Interaction.summary`, `Interaction.transcript`,
 * `Interaction.followUps`. Nothing here is a rigid enum the model would have
 * to fight, and no field is a denormalized rollup that would go stale.
 * Validation lives here (not in the route handlers) so the HTTP layer and the
 * seed share one definition of a valid record.
 */

export const CLIENT_STATUSES = ["prospect", "active", "at_risk", "churned"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const INTERACTION_TYPES = ["call", "meeting", "email", "conversation", "other"] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

/** Fields every record carries: ownership, authorship, timestamps. */
export interface BaseRecord {
  id: string;
  /** The verified principal this record belongs to. Every query filters on it. */
  ownerId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Client extends BaseRecord {
  name: string;
  industry?: string;
  website?: string;
  status: ClientStatus;
  owner?: string;
  /** Annual recurring revenue in whole currency units. */
  arr?: number;
  renewalDate?: string;
  tags: string[];
  /** Freeform context the coaching layer will read. */
  summary?: string;
}

export interface Contact extends BaseRecord {
  clientId: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  isPrimary: boolean;
  notes?: string;
}

export interface Note extends BaseRecord {
  clientId: string;
  body: string;
  pinned: boolean;
}

export interface Interaction extends BaseRecord {
  clientId: string;
  type: InteractionType;
  subject: string;
  occurredAt: string;
  participants: string[];
  /** Human summary of what happened. */
  summary?: string;
  /** Raw transcript or long-form notes; the richest AI input. */
  transcript?: string;
  followUps: string[];
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

const MAX_SHORT = 200;
const MAX_LONG = 20_000;

function readString(
  raw: unknown,
  field: string,
  { required = false, max = MAX_SHORT }: { required?: boolean; max?: number } = {},
): ValidationResult<string | undefined> {
  if (raw === undefined || raw === null || raw === "") {
    if (required) return { ok: false, error: `${field} is required` };
    return { ok: true, value: undefined };
  }
  if (typeof raw !== "string") return { ok: false, error: `${field} must be a string` };
  const trimmed = raw.trim();
  if (required && !trimmed) return { ok: false, error: `${field} is required` };
  if (trimmed.length > max) return { ok: false, error: `${field} must be at most ${max} characters` };
  return { ok: true, value: trimmed || undefined };
}

function readStringArray(raw: unknown, field: string): ValidationResult<string[]> {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: `${field} must be an array of strings` };
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") return { ok: false, error: `${field} must contain only strings` };
    const trimmed = entry.trim();
    if (trimmed) out.push(trimmed.slice(0, MAX_SHORT));
  }
  return { ok: true, value: out.slice(0, 50) };
}

function readEnum<T extends string>(
  raw: unknown,
  field: string,
  allowed: readonly T[],
  fallback?: T,
): ValidationResult<T> {
  if (raw === undefined || raw === null || raw === "") {
    if (fallback !== undefined) return { ok: true, value: fallback };
    return { ok: false, error: `${field} is required` };
  }
  if (typeof raw !== "string" || !allowed.includes(raw as T)) {
    return { ok: false, error: `${field} must be one of: ${allowed.join(", ")}` };
  }
  return { ok: true, value: raw as T };
}

/** ISO-8601 date, normalized. Rejects unparseable input rather than coercing to epoch. */
function readDate(raw: unknown, field: string, fallback?: string): ValidationResult<string | undefined> {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: fallback };
  }
  if (typeof raw !== "string") return { ok: false, error: `${field} must be an ISO date string` };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { ok: false, error: `${field} must be a valid ISO date` };
  return { ok: true, value: parsed.toISOString() };
}

function readNumber(raw: unknown, field: string): ValidationResult<number | undefined> {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: undefined };
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return { ok: false, error: `${field} must be a non-negative number` };
  return { ok: true, value: parsed };
}

function isObject(body: unknown): body is Record<string, unknown> {
  return typeof body === "object" && body !== null && !Array.isArray(body);
}

export interface ClientInput {
  name: string;
  industry?: string;
  website?: string;
  status: ClientStatus;
  owner?: string;
  arr?: number;
  renewalDate?: string;
  tags: string[];
  summary?: string;
}

export function validateClient(body: unknown, { partial = false } = {}): ValidationResult<Partial<ClientInput>> {
  if (!isObject(body)) return { ok: false, error: "Invalid request body" };

  const name = readString(body.name, "name", { required: !partial });
  if (!name.ok) return name;
  const industry = readString(body.industry, "industry");
  if (!industry.ok) return industry;
  const website = readString(body.website, "website", { max: 500 });
  if (!website.ok) return website;
  const owner = readString(body.owner, "owner");
  if (!owner.ok) return owner;
  const summary = readString(body.summary, "summary", { max: MAX_LONG });
  if (!summary.ok) return summary;
  const status = readEnum(body.status, "status", CLIENT_STATUSES, partial ? undefined : "prospect");
  if (body.status !== undefined && !status.ok) return status;
  const arr = readNumber(body.arr, "arr");
  if (!arr.ok) return arr;
  const renewalDate = readDate(body.renewalDate, "renewalDate");
  if (!renewalDate.ok) return renewalDate;
  const tags = readStringArray(body.tags, "tags");
  if (!tags.ok) return tags;

  const value: Partial<ClientInput> = {};
  if (name.value !== undefined) value.name = name.value;
  if (body.industry !== undefined) value.industry = industry.value;
  if (body.website !== undefined) value.website = website.value;
  if (body.owner !== undefined) value.owner = owner.value;
  if (body.summary !== undefined) value.summary = summary.value;
  if (status.ok && (body.status !== undefined || !partial)) value.status = status.value;
  if (body.arr !== undefined) value.arr = arr.value;
  if (body.renewalDate !== undefined) value.renewalDate = renewalDate.value;
  if (body.tags !== undefined || !partial) value.tags = tags.value;
  return { ok: true, value };
}

export interface ContactInput {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  isPrimary: boolean;
  notes?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContact(body: unknown, { partial = false } = {}): ValidationResult<Partial<ContactInput>> {
  if (!isObject(body)) return { ok: false, error: "Invalid request body" };

  const name = readString(body.name, "name", { required: !partial });
  if (!name.ok) return name;
  const title = readString(body.title, "title");
  if (!title.ok) return title;
  const phone = readString(body.phone, "phone", { max: 60 });
  if (!phone.ok) return phone;
  const notes = readString(body.notes, "notes", { max: MAX_LONG });
  if (!notes.ok) return notes;
  const email = readString(body.email, "email", { max: 320 });
  if (!email.ok) return email;
  if (email.value !== undefined && !EMAIL_REGEX.test(email.value)) {
    return { ok: false, error: "email must be a valid address" };
  }

  const value: Partial<ContactInput> = {};
  if (name.value !== undefined) value.name = name.value;
  if (body.title !== undefined) value.title = title.value;
  if (body.email !== undefined) value.email = email.value;
  if (body.phone !== undefined) value.phone = phone.value;
  if (body.notes !== undefined) value.notes = notes.value;
  if (body.isPrimary !== undefined || !partial) value.isPrimary = Boolean(body.isPrimary);
  return { ok: true, value };
}

export interface NoteInput {
  body: string;
  pinned: boolean;
}

export function validateNote(body: unknown, { partial = false } = {}): ValidationResult<Partial<NoteInput>> {
  if (!isObject(body)) return { ok: false, error: "Invalid request body" };
  const text = readString(body.body, "body", { required: !partial, max: MAX_LONG });
  if (!text.ok) return text;
  const value: Partial<NoteInput> = {};
  if (text.value !== undefined) value.body = text.value;
  if (body.pinned !== undefined || !partial) value.pinned = Boolean(body.pinned);
  return { ok: true, value };
}

export interface InteractionInput {
  type: InteractionType;
  subject: string;
  occurredAt: string;
  participants: string[];
  summary?: string;
  transcript?: string;
  followUps: string[];
}

export function validateInteraction(
  body: unknown,
  { partial = false, now = new Date() } = {},
): ValidationResult<Partial<InteractionInput>> {
  if (!isObject(body)) return { ok: false, error: "Invalid request body" };

  const subject = readString(body.subject, "subject", { required: !partial });
  if (!subject.ok) return subject;
  const type = readEnum(body.type, "type", INTERACTION_TYPES, partial ? undefined : "call");
  if (body.type !== undefined && !type.ok) return type;
  const occurredAt = readDate(body.occurredAt, "occurredAt", partial ? undefined : now.toISOString());
  if (!occurredAt.ok) return occurredAt;
  const summary = readString(body.summary, "summary", { max: MAX_LONG });
  if (!summary.ok) return summary;
  const transcript = readString(body.transcript, "transcript", { max: MAX_LONG * 5 });
  if (!transcript.ok) return transcript;
  const participants = readStringArray(body.participants, "participants");
  if (!participants.ok) return participants;
  const followUps = readStringArray(body.followUps, "followUps");
  if (!followUps.ok) return followUps;

  const value: Partial<InteractionInput> = {};
  if (subject.value !== undefined) value.subject = subject.value;
  if (type.ok && (body.type !== undefined || !partial)) value.type = type.value;
  if (occurredAt.value !== undefined) value.occurredAt = occurredAt.value;
  if (body.summary !== undefined) value.summary = summary.value;
  if (body.transcript !== undefined) value.transcript = transcript.value;
  if (body.participants !== undefined || !partial) value.participants = participants.value;
  if (body.followUps !== undefined || !partial) value.followUps = followUps.value;
  return { ok: true, value };
}
