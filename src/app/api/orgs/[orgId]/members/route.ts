import { errorResponse, json, readJsonBody, withOrgScope } from "@/lib/api";
import {
  getOrgPermissions,
  inviteOrgMember,
  listInvitableRoles,
  listOrgMembers,
  listPendingMembers,
} from "@/lib/redorg";

/**
 * The members surface for one org: who is in it, which seats are still
 * pending, and the invite that adds the next person.
 *
 * Reads require only membership. Writes are gated on the directory's own
 * role permissions (`org:invite_members` to seat someone), never on a flag
 * invented here: the Owner and Admin role templates carry those grants.
 */
export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  const { orgId } = await params;
  return withOrgScope(request, orgId, async ({ principal, membership }) => {
    const [members, pending, roles, permissions] = await Promise.all([
      listOrgMembers(orgId),
      listPendingMembers(orgId),
      listInvitableRoles(orgId),
      getOrgPermissions(orgId, principal.userId),
    ]);
    return json({
      org: membership,
      currentUserId: principal.userId,
      canInvite: membership.isOwner || permissions.includes("org:invite_members"),
      canManage: membership.isOwner || permissions.includes("org:manage_members"),
      members,
      pendingSeats: pending.map((seat) => ({
        email: seat.email,
        roleSlug: seat.roleSlug ?? "member",
        createdAt: seat.createdAt,
      })),
      roles,
    });
  });
}

export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  const { orgId } = await params;
  return withOrgScope(request, orgId, async ({ principal, membership }) => {
    const permissions = await getOrgPermissions(orgId, principal.userId);
    if (!membership.isOwner && !permissions.includes("org:invite_members")) {
      return errorResponse(403, "You do not have permission to invite members to this org");
    }

    const body = await readJsonBody(request);
    if (!body.ok) return errorResponse(400, body.error);
    const value = body.value as { email?: unknown; roleSlug?: unknown };
    const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
    if (!EMAIL_PATTERN.test(email)) return errorResponse(400, "A valid email address is required");
    const roleSlug = typeof value.roleSlug === "string" && value.roleSlug ? value.roleSlug : "member";

    const roles = await listInvitableRoles(orgId);
    if (!roles.some((role) => role.slug === roleSlug)) {
      return errorResponse(400, "Unknown role for this org");
    }

    const result = await inviteOrgMember(orgId, email, roleSlug, principal);
    if (result.outcome === "already-member") {
      return errorResponse(409, "That person is already a member of this org");
    }
    return json({ outcome: result.outcome, email, roleSlug }, 201);
  });
}
