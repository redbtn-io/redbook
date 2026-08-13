import { describe, expect, it } from "vitest";

import {
  validateClient,
  validateContact,
  validateInteraction,
  validateNote,
} from "@/lib/crm";

describe("validateClient", () => {
  it("requires a name and defaults status", () => {
    expect(validateClient({})).toEqual({ ok: false, error: "name is required" });
    const result = validateClient({ name: "  FinThrive  " });
    expect(result).toEqual({ ok: true, value: { name: "FinThrive", status: "prospect", tags: [] } });
  });

  it("rejects an unknown status", () => {
    const result = validateClient({ name: "Acme", status: "on_fire" });
    expect(result.ok).toBe(false);
  });

  it("normalizes dates and rejects unparseable ones", () => {
    const good = validateClient({ name: "Acme", renewalDate: "2026-11-01" });
    expect(good.ok && good.value.renewalDate).toBe("2026-11-01T00:00:00.000Z");
    // Coercing a bad date to the epoch would silently corrupt a renewal.
    expect(validateClient({ name: "Acme", renewalDate: "not-a-date" }).ok).toBe(false);
  });

  it("rejects a negative ARR", () => {
    expect(validateClient({ name: "Acme", arr: -1 }).ok).toBe(false);
    const ok = validateClient({ name: "Acme", arr: "240000" });
    expect(ok.ok && ok.value.arr).toBe(240000);
  });

  it("in partial mode only touches the fields actually supplied", () => {
    const result = validateClient({ status: "active" }, { partial: true });
    expect(result).toEqual({ ok: true, value: { status: "active" } });
  });

  it("rejects non-string tags rather than coercing them", () => {
    expect(validateClient({ name: "Acme", tags: [1, 2] }).ok).toBe(false);
    const ok = validateClient({ name: "Acme", tags: [" rcm ", ""] });
    expect(ok.ok && ok.value.tags).toEqual(["rcm"]);
  });
});

describe("validateContact", () => {
  it("requires a name", () => {
    expect(validateContact({}).ok).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(validateContact({ name: "Dana", email: "not-an-email" }).ok).toBe(false);
    expect(validateContact({ name: "Dana", email: "dana@example.com" }).ok).toBe(true);
  });

  it("coerces isPrimary to a boolean", () => {
    const result = validateContact({ name: "Dana", isPrimary: "yes" });
    expect(result.ok && result.value.isPrimary).toBe(true);
  });
});

describe("validateNote", () => {
  it("requires a body", () => {
    expect(validateNote({}).ok).toBe(false);
    expect(validateNote({ body: "   " }).ok).toBe(false);
  });

  it("accepts long freeform text, which the coaching layer will need", () => {
    const body = "x".repeat(19_000);
    expect(validateNote({ body }).ok).toBe(true);
  });

  it("rejects text past the cap", () => {
    expect(validateNote({ body: "x".repeat(20_001) }).ok).toBe(false);
  });
});

describe("validateInteraction", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");

  it("requires a subject and defaults type and date", () => {
    expect(validateInteraction({}, { now }).ok).toBe(false);
    const result = validateInteraction({ subject: "QBR" }, { now });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe("call");
      expect(result.value.occurredAt).toBe("2026-08-13T12:00:00.000Z");
    }
  });

  it("keeps transcripts and follow-ups as first-class freeform fields", () => {
    const result = validateInteraction(
      {
        subject: "QBR",
        type: "meeting",
        transcript: "Josh: ...\nDana: ...",
        followUps: ["Send the deck", " Price the SLA "],
        participants: ["Dana Whitfield", "Josh"],
      },
      { now },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.transcript).toContain("Dana:");
      expect(result.value.followUps).toEqual(["Send the deck", "Price the SLA"]);
      expect(result.value.participants).toEqual(["Dana Whitfield", "Josh"]);
    }
  });

  it("rejects an unknown interaction type", () => {
    expect(validateInteraction({ subject: "x", type: "telepathy" }, { now }).ok).toBe(false);
  });
});
