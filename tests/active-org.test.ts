import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/redorg", () => ({ resolveActiveOrg: vi.fn() }));

import { cookies } from "next/headers";

import { resolvePageOrg } from "../src/lib/active-org";
import type { OrgMembership } from "../src/lib/authz";
import { resolveActiveOrg } from "../src/lib/redorg";
import type { Principal } from "../src/lib/session";

/**
 * The regression test for the split-brain book header (November 12, 2026):
 * a fresh page load showed the org switcher on FinThrive while the body
 * still named the personal book, because pages resolved the active org in
 * more than one place. `resolvePageOrg` is now the single resolution every
 * page renders from, and these tests pin its contract: the cookie's org is
 * the answer on the first call, with no second, default resolution sneaking
 * a different book into the body.
 */
const principal: Principal = { userId: "user-1", email: "george@redbtn.io", via: "cookie" };

const finthrive: OrgMembership = {
  orgId: "org-finthrive",
  orgName: "FinThrive",
  orgSlug: "finthrive",
  isOwner: true,
};
const personal: OrgMembership = {
  orgId: "org-personal",
  orgName: "george@redbtn.io's book",
  orgSlug: "book-user-1",
  isOwner: true,
};
const memberships = [finthrive, personal];

function setOrgCookie(value?: string) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === "redbook_org" && value ? { name, value } : undefined,
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolvePageOrg", () => {
  it("resolves the cookie's org in one call, never falling through to the default", async () => {
    setOrgCookie("org-finthrive");
    vi.mocked(resolveActiveOrg).mockResolvedValue({ membership: finthrive, memberships });

    const resolved = await resolvePageOrg(principal);

    expect(vi.mocked(resolveActiveOrg)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(resolveActiveOrg)).toHaveBeenCalledWith(principal, "org-finthrive");
    expect(resolved?.membership.orgId).toBe("org-finthrive");
    expect(resolved?.membership.orgName).toBe("FinThrive");
  });

  it("lets an explicit org parameter beat the cookie", async () => {
    setOrgCookie("org-finthrive");
    vi.mocked(resolveActiveOrg).mockResolvedValue({ membership: personal, memberships });

    const resolved = await resolvePageOrg(principal, "org-personal");

    expect(vi.mocked(resolveActiveOrg)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(resolveActiveOrg)).toHaveBeenCalledWith(principal, "org-personal");
    expect(resolved?.membership.orgId).toBe("org-personal");
  });

  it("falls back to the default book when the cookie names an org the caller left", async () => {
    setOrgCookie("org-gone");
    vi.mocked(resolveActiveOrg)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ membership: personal, memberships });

    const resolved = await resolvePageOrg(principal);

    expect(vi.mocked(resolveActiveOrg)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(resolveActiveOrg)).toHaveBeenNthCalledWith(1, principal, "org-gone");
    expect(vi.mocked(resolveActiveOrg)).toHaveBeenNthCalledWith(2, principal);
    expect(resolved?.membership.orgId).toBe("org-personal");
  });

  it("asks for the default directly when there is no parameter and no cookie", async () => {
    setOrgCookie(undefined);
    vi.mocked(resolveActiveOrg).mockResolvedValue({ membership: personal, memberships });

    const resolved = await resolvePageOrg(principal);

    expect(vi.mocked(resolveActiveOrg)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(resolveActiveOrg)).toHaveBeenCalledWith(principal, null);
    expect(resolved?.membership.orgId).toBe("org-personal");
  });

  it("returns null when the caller belongs to no org at all", async () => {
    setOrgCookie(undefined);
    vi.mocked(resolveActiveOrg).mockResolvedValue(null);

    await expect(resolvePageOrg(principal)).resolves.toBeNull();
    expect(vi.mocked(resolveActiveOrg)).toHaveBeenCalledTimes(1);
  });
});
