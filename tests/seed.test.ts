import { describe, expect, it } from "vitest";

import { seedRecords } from "@/lib/seed";
import { validateClient, validateContact, validateInteraction, validateNote } from "@/lib/crm";

/**
 * The seed is the first thing anyone sees, and it is written by hand. These
 * checks make sure it stays valid against the same rules the HTTP layer
 * enforces, so a typo in placeholder content cannot ship a record the API
 * would have rejected.
 */
describe("seed data", () => {
  const records = seedRecords();

  it("seeds healthcare-provider clients, and never FinThrive itself", () => {
    // FinThrive is the ORG (Josh's employer), not an account in the book.
    // Seeding it as a client is the exact mistake this guards against.
    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(records.length).toBeLessThanOrEqual(3);
    for (const record of records) {
      expect(record.client.name.toLowerCase()).not.toContain("finthrive");
    }
    const industries = records.map((r) => (r.client.industry ?? "").toLowerCase());
    expect(industries.some((i) => /hospital|physician|delivery network/.test(i))).toBe(true);
  });

  it("gives every client at least one contact and some written context", () => {
    for (const record of records) {
      expect(record.contacts.length).toBeGreaterThan(0);
      expect(record.notes.length).toBeGreaterThan(0);
      expect(record.interactions.length).toBeGreaterThan(0);
    }
  });

  it("produces clients that pass the same validation the API applies", () => {
    for (const record of records) {
      const result = validateClient(record.client);
      expect(result.ok, `client ${record.client.name}: ${result.ok ? "" : result.error}`).toBe(true);
    }
  });

  it("produces contacts, notes, and interactions that all validate", () => {
    for (const record of records) {
      for (const contact of record.contacts) {
        const result = validateContact(contact);
        expect(result.ok, result.ok ? "" : result.error).toBe(true);
      }
      for (const note of record.notes) {
        const result = validateNote(note);
        expect(result.ok, result.ok ? "" : result.error).toBe(true);
      }
      for (const interaction of record.interactions) {
        const result = validateInteraction(interaction);
        expect(result.ok, result.ok ? "" : result.error).toBe(true);
      }
    }
  });

  it("gives each account exactly one primary contact", () => {
    for (const record of records) {
      expect(record.contacts.filter((contact) => contact.isPrimary)).toHaveLength(1);
    }
  });

  it("carries the freeform material the coaching layer will read", () => {
    for (const record of records) {
      expect(record.notes.some((note) => note.pinned)).toBe(true);
      expect(record.interactions.every((entry) => entry.summary)).toBe(true);
      expect(record.interactions.some((entry) => entry.followUps.length > 0)).toBe(true);
    }
    expect(records.some((r) => r.interactions.some((e) => e.transcript))).toBe(true);
  });

  it("dates interactions in the past and the renewal in the future", () => {
    const now = Date.now();
    for (const record of records) {
      for (const interaction of record.interactions) {
        expect(new Date(interaction.occurredAt).getTime()).toBeLessThanOrEqual(now);
      }
      if (record.client.renewalDate) {
        expect(new Date(record.client.renewalDate).getTime()).toBeGreaterThan(now);
      }
    }
  });

  it("uses only example.com contact details, never a real address", () => {
    // Placeholder people must not resolve to a real inbox or phone.
    for (const record of records) {
      for (const contact of record.contacts) {
        if (contact.email) expect(contact.email).toMatch(/@example\.com$/);
      }
    }
  });
});
