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

  it("seeds FinThrive as a client", () => {
    expect(records).toHaveLength(1);
    expect(records[0].client.name).toBe("FinThrive");
    expect(records[0].client.industry).toMatch(/revenue cycle/i);
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

  it("gives the account exactly one primary contact", () => {
    for (const record of records) {
      expect(record.contacts.filter((contact) => contact.isPrimary)).toHaveLength(1);
    }
  });

  it("carries the freeform material the coaching layer will read", () => {
    const [record] = records;
    expect(record.notes.some((note) => note.pinned)).toBe(true);
    expect(record.interactions.some((entry) => entry.transcript)).toBe(true);
    expect(record.interactions.every((entry) => entry.summary)).toBe(true);
    expect(record.interactions.some((entry) => entry.followUps.length > 0)).toBe(true);
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
