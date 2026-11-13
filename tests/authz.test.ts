import { describe, expect, it } from "vitest";

import {
  canDeleteClient,
  orgFilter,
  ownsResource,
  requireOrgAccess,
  requireOrgFilter,
  requireOwnership,
  type OrgMembership,
} from "@/lib/authz";
import type { Principal } from "@/lib/session";

const principal: Principal = { userId: "user-1", email: "josh@example.com", via: "cookie" };

const finthrive: OrgMembership = {
  orgId: "org-finthrive",
  orgName: "FinThrive",
  orgSlug: "finthrive",
  isOwner: false,
};
const otherOrg: OrgMembership = {
  orgId: "org-rival",
  orgName: "Rival Co",
  orgSlug: "rival",
  isOwner: true,
};

describe("requireOrgAccess", () => {
  it("allows a member of the org", () => {
    expect(requireOrgAccess(principal, "org-finthrive", [finthrive])).toEqual({ allowed: true });
  });

  it("forbids an org the principal does not belong to", () => {
    // The whole tenancy boundary: a known-good orgId is still refused when the
    // caller's membership list does not contain it.
    expect(requireOrgAccess(principal, "org-rival", [finthrive])).toEqual({
      allowed: false,
      status: 403,
      error: "Forbidden",
    });
  });

  it("distinguishes unauthenticated (401) from forbidden (403)", () => {
    expect(requireOrgAccess(null, "org-finthrive", [finthrive])).toEqual({
      allowed: false,
      status: 401,
      error: "Not authenticated",
    });
  });

  it("forbids a blank org id rather than matching anything", () => {
    expect(requireOrgAccess(principal, "", [finthrive]).allowed).toBe(false);
  });

  it("allows any org in a multi-org membership list", () => {
    expect(requireOrgAccess(principal, "org-rival", [finthrive, otherOrg])).toEqual({ allowed: true });
  });
});

describe("orgFilter", () => {
  it("derives the filter from a proven membership", () => {
    expect(orgFilter(finthrive)).toEqual({ orgId: "org-finthrive" });
  });

  it("throws rather than returning an unscoped filter", () => {
    // An accidental `{}` here would read every tenant's records at once.
    expect(() => requireOrgFilter(null)).toThrow();
    expect(() => requireOrgFilter({ ...finthrive, orgId: "" })).toThrow();
    expect(requireOrgFilter(finthrive)).toEqual({ orgId: "org-finthrive" });
  });
});

describe("authorship helpers", () => {
  it("reports who created a record without gating access on it", () => {
    // Authorship is attribution, not permission: a colleague in the same org
    // must still be able to edit a client someone else typed in.
    expect(ownsResource(principal, "user-1")).toBe(true);
    expect(ownsResource(principal, "user-2")).toBe(false);
    expect(ownsResource(null, "user-1")).toBe(false);
  });

  it("still distinguishes 401 from 403 where authorship IS the check", () => {
    expect(requireOwnership(principal, "user-1")).toEqual({ allowed: true });
    expect(requireOwnership(null, "user-1").allowed).toBe(false);
    expect(requireOwnership(principal, "user-2")).toEqual({
      allowed: false,
      status: 403,
      error: "Forbidden",
    });
  });
});

describe("canDeleteClient", () => {
  it("allows the org owner with no directory permissions resolved", () => {
    expect(canDeleteClient(otherOrg, [])).toBe(true);
  });

  it("allows a member whose role carries org:manage_members (the admin grant)", () => {
    expect(canDeleteClient(finthrive, ["org:invite_members", "org:manage_members"])).toBe(true);
  });

  it("refuses an ordinary member, even one who can invite", () => {
    // Client deletion cascades to every child record, so it is held to the
    // member-management standard, not the editing standard every member has.
    expect(canDeleteClient(finthrive, [])).toBe(false);
    expect(canDeleteClient(finthrive, ["org:invite_members"])).toBe(false);
  });
});
