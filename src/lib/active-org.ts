import "server-only";

import { cookies } from "next/headers";

import type { OrgMembership } from "@/lib/authz";
import { ORG_COOKIE } from "@/lib/org-cookie";
import { resolveActiveOrg } from "@/lib/redorg";
import type { Principal } from "@/lib/session";

export interface ResolvedOrg {
  membership: OrgMembership;
  memberships: OrgMembership[];
}

/**
 * THE org resolution for server-rendered pages, and the only one.
 *
 * Every page renders twice over from this one result: the header (the org
 * switcher or label in `Shell`) and the body (the book on screen) both take
 * the same `membership`. That only holds if there is exactly one place
 * where a request becomes an org, so no page assembles its own ref from
 * the query string and the cookie anymore. The copies agreed most of the
 * time, but "most of the time" is how a page once loaded with the switcher
 * sitting on one book while the body still named another (November 12,
 * 2026): two resolutions of the same request, two answers.
 *
 * Selection order, the redSocial pattern: an explicit `org` parameter on
 * the link wins, then the last-used-org cookie the switcher sets, then the
 * caller's default book inside `resolveActiveOrg`. A ref that names an org
 * the caller has left is stale, not an error: fall back to the default
 * book rather than stranding them on an empty state.
 */
export async function resolvePageOrg(
  principal: Principal,
  orgParam?: string | string[] | null,
): Promise<ResolvedOrg | null> {
  const cookieStore = await cookies();
  const requestedOrg =
    (typeof orgParam === "string" ? orgParam : null) ?? cookieStore.get(ORG_COOKIE)?.value ?? null;
  let resolved = await resolveActiveOrg(principal, requestedOrg);
  if (!resolved && requestedOrg) {
    resolved = await resolveActiveOrg(principal);
  }
  return resolved;
}
