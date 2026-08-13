import { describe, expect, it } from "vitest";

import {
  loadRuntimeConfig,
  normalizeSecret,
  signInUrl,
  toPublicRuntimeConfig,
  validateRuntimeConfig,
} from "@/lib/config";

describe("normalizeSecret", () => {
  it("strips wrapping quotes", () => {
    // A quoted secret is the recurring fleet foot-gun: it verifies nothing and
    // reports itself as a signature mismatch.
    expect(normalizeSecret('"abc123"')).toBe("abc123");
    expect(normalizeSecret("'abc123'")).toBe("abc123");
  });

  it("leaves an unquoted secret and inner quotes alone", () => {
    expect(normalizeSecret("abc123")).toBe("abc123");
    expect(normalizeSecret('ab"c123')).toBe('ab"c123');
  });

  it("treats empty and missing values as absent", () => {
    expect(normalizeSecret("")).toBeUndefined();
    expect(normalizeSecret('""')).toBeUndefined();
    expect(normalizeSecret("   ")).toBeUndefined();
    expect(normalizeSecret(undefined)).toBeUndefined();
  });
});

describe("loadRuntimeConfig", () => {
  it("reads deployment settings from env", () => {
    const config = loadRuntimeConfig({
      PUBLIC_URL: "https://book.redbtn.io/",
      MONGODB_URI: "mongodb://user:pass@10.0.0.1:27017/redbook?authSource=admin",
      MONGODB_DB: "redbook",
      JWT_SECRET: '"quoted-secret"',
      REDRUN_CHANNEL: "production",
    });

    expect(config.publicUrl).toBe("https://book.redbtn.io");
    expect(config.mongoDbName).toBe("redbook");
    expect(config.jwtSecret).toBe("quoted-secret");
    expect(config.channel).toBe("production");
    expect(config.cookieName).toBe("red_session");
  });

  it("defaults the accounts host to the central sign-in origin", () => {
    expect(loadRuntimeConfig({}).accountsUrl).toBe("https://accounts.redbtn.io");
  });

  it("has no Mongo default in production so a misconfigured deploy fails loudly", () => {
    const config = loadRuntimeConfig({ REDRUN_CHANNEL: "production" });
    expect(config.mongoUri).toBe("");
    expect(validateRuntimeConfig(config)).toContain("MONGODB_URI is required");
  });

  it("accepts either JWT_SECRET or the redsecrets bootstrap key", () => {
    const base = { MONGODB_URI: "mongodb://127.0.0.1:27017/redbook" };
    expect(validateRuntimeConfig(loadRuntimeConfig(base))).toHaveLength(1);
    expect(
      validateRuntimeConfig(loadRuntimeConfig({ ...base, JWT_SECRET: "s" })),
    ).toHaveLength(0);
    expect(
      validateRuntimeConfig(loadRuntimeConfig({ ...base, REDBOOK_SECRETS_ENCRYPTION_KEY: "k" })),
    ).toHaveLength(0);
  });
});

describe("org membership settings", () => {
  it("defaults to the FinThrive org with George and a Josh placeholder", () => {
    const config = loadRuntimeConfig({});
    expect(config.defaultOrgName).toBe("FinThrive");
    expect(config.defaultOrgSlug).toBe("finthrive");
    expect(config.orgMemberEmails).toEqual(["george8794@gmail.com", "josh@finthrive.example"]);
  });

  it("parses, lowercases, and de-duplicates a configured member list", () => {
    // Swapping in Josh's real address must be a one-line env change.
    const config = loadRuntimeConfig({
      REDBOOK_ORG_MEMBER_EMAILS: " George8794@Gmail.com , josh@finthrive.com,josh@finthrive.com ,junk ",
    });
    expect(config.orgMemberEmails).toEqual(["george8794@gmail.com", "josh@finthrive.com"]);
  });

  it("accepts an empty member list without inventing one", () => {
    expect(loadRuntimeConfig({ REDBOOK_ORG_MEMBER_EMAILS: "" }).orgMemberEmails).toEqual([]);
  });

  it("defaults the redauth directory to the app's Mongo host", () => {
    const config = loadRuntimeConfig({ MONGODB_URI: "mongodb://127.0.0.1:27017/redbook" });
    expect(config.authMongoDbName).toBe("redauth");
  });
});

describe("signInUrl", () => {
  const config = loadRuntimeConfig({
    PUBLIC_URL: "https://book.redbtn.io",
    ACCOUNTS_URL: "https://accounts.redbtn.io",
  });

  it("uses the ?next= contract on the accounts root path", () => {
    // accounts.redbtn.io reads `next` from the ROOT path; a /signin?returnTo=
    // shape is silently ignored and the user lands on redbtn.io instead.
    expect(signInUrl(config, "/")).toBe(
      "https://accounts.redbtn.io/?next=https%3A%2F%2Fbook.redbtn.io%2F",
    );
  });

  it("round-trips a deep link so sign-in returns to the page requested", () => {
    const url = new URL(signInUrl(config, "/clients/abc123"));
    expect(url.origin).toBe("https://accounts.redbtn.io");
    expect(url.searchParams.get("next")).toBe("https://book.redbtn.io/clients/abc123");
  });

  it("produces an https first-party URL, which is all accounts will accept", () => {
    const next = new URL(new URL(signInUrl(config, "/")).searchParams.get("next")!);
    expect(next.protocol).toBe("https:");
    expect(next.hostname.endsWith(".redbtn.io")).toBe(true);
  });
});

describe("toPublicRuntimeConfig", () => {
  it("exposes no connection URI and no secret", () => {
    const config = loadRuntimeConfig({
      MONGODB_URI: "mongodb://user:hunter2@10.0.0.1:27017/redbook",
      JWT_SECRET: "super-secret",
    });
    const serialized = JSON.stringify(toPublicRuntimeConfig(config, true));
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("10.0.0.1");
  });
});
