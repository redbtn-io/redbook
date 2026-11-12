import { errorResponse, json, withOrgScope } from "@/lib/api";
import { getOrgPermissions, removeOrgMember } from "@/lib/redorg";

/**
 * Remove a real member from an org. Gated on `org:manage_members` (which
 * implies `org:remove_members` in the directory's permission templates).
 * The org owner can never be removed through this route; `removeOrgMember`
 * refuses, because an org whose owner vanished strands every record in it.
 */
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orgId: string; userId: string }>;
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<Response> {
  const { orgId, userId } = await params;
  return withOrgScope(request, orgId, async ({ principal, membership }) => {
    if (!membership.isOwner) {
      const permissions = await getOrgPermissions(orgId, principal.userId);
      if (!permissions.includes("org:manage_members")) {
        return errorResponse(403, "You do not have permission to manage members of this org");
      }
    }

    const result = await removeOrgMember(orgId, userId, principal);
    if (!result.removed) return errorResponse(400, result.reason ?? "Could not remove that member");
    return json({ removed: true, userId });
  });
}
