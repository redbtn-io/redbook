import { json, withOrg } from "@/lib/api";

/**
 * The books this caller belongs to, and which one is active. Sourced from
 * redOrg membership, so it doubles as the authoritative answer to "what am I
 * allowed to see?".
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withOrg(request, async ({ membership, memberships }) =>
    json({ activeOrgId: membership.orgId, orgs: memberships }),
  );
}
