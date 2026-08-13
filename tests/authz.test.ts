import { describe, expect, it } from "vitest";

import { ownerFilter, ownsResource, requireOwnerFilter, requireOwnership } from "@/lib/authz";
import type { Principal } from "@/lib/session";

const principal: Principal = { userId: "user-1", email: "josh@example.com", via: "cookie" };

describe("ownsResource", () => {
  it("is true only for the principal's own records", () => {
    expect(ownsResource(principal, "user-1")).toBe(true);
    expect(ownsResource(principal, "user-2")).toBe(false);
  });

  it("is false for a missing principal or a blank owner id", () => {
    expect(ownsResource(null, "user-1")).toBe(false);
    expect(ownsResource(principal, "")).toBe(false);
  });
});

describe("requireOwnership", () => {
  it("allows the owner", () => {
    expect(requireOwnership(principal, "user-1")).toEqual({ allowed: true });
  });

  it("distinguishes unauthenticated (401) from forbidden (403)", () => {
    expect(requireOwnership(null, "user-1")).toEqual({
      allowed: false,
      status: 401,
      error: "Not authenticated",
    });
    expect(requireOwnership(principal, "user-2")).toEqual({
      allowed: false,
      status: 403,
      error: "Forbidden",
    });
  });
});

describe("ownerFilter", () => {
  it("derives the filter from the principal, never from input", () => {
    expect(ownerFilter(principal)).toEqual({ ownerId: "user-1" });
  });

  it("returns null without a principal so a caller cannot get an unscoped filter", () => {
    expect(ownerFilter(null)).toBeNull();
  });

  it("throws rather than returning an unscoped filter", () => {
    // An accidental `{}` here would be a full-database read.
    expect(() => requireOwnerFilter(null as unknown as Principal)).toThrow();
    expect(requireOwnerFilter(principal)).toEqual({ ownerId: "user-1" });
  });
});
