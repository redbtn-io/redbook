import { errorResponse, json, readJsonBody, withOrgScope } from "@/lib/api";
import {
  changePendingSeatEmail,
  getOrgPermissions,
  listOrgMembers,
  listPendingMembers,
  revokePendingSeat,
} from "@/lib/redorg";

/**
 * Pending seat maintenance: fix the address a seat is waiting for, or
 * revoke the seat outright. This is the route that makes a placeholder
 * seat (a stand-in address created before the person's real one was
 * known) correctable from the product, with no database access.
 *
 * Gated on `org:manage_members`: changing who a seat will admit is a
 * membership decision, not a mere invite.
 */
export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

async function canManageOrg(
  orgId: string,
  userId: string,
  isOwner: boolean,
): Promise<boolean> {
  if (isOwner) return true;
  const permissions = await getOrgPermissions(orgId, userId);
  return permissions.includes("org:manage_members");
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  const { orgId } = await params;
  return withOrgScope(request, orgId, async ({ principal, membership }) => {
    if (!(await canManageOrg(orgId, principal.userId, membership.isOwner))) {
      return errorResponse(403, "You do not have permission to manage members of this org");
    }

    const body = await readJsonBody(request);
    if (!body.ok) return errorResponse(400, body.error);
    const value = body.value as { email?: unknown; newEmail?: unknown };
    const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
    const newEmail = typeof value.newEmail === "string" ? value.newEmail.trim().toLowerCase() : "";
    if (!EMAIL_PATTERN.test(email) || !EMAIL_PATTERN.test(newEmail)) {
      return errorResponse(400, "Valid current and new email addresses are required");
    }
    if (email === newEmail) return errorResponse(400, "The new email is the same as the current one");

    const pending = await listPendingMembers(orgId);
    if (!pending.some((seat) => seat.email === email)) {
      return errorResponse(404, "No pending seat for that email");
    }
    if (pending.some((seat) => seat.email === newEmail)) {
      return errorResponse(409, "A pending seat for the new email already exists");
    }
    const members = await listOrgMembers(orgId);
    if (members.some((member) => member.email === newEmail)) {
      return errorResponse(409, "That email already belongs to a member of this org");
    }

    const changed = await changePendingSeatEmail(orgId, email, newEmail, principal);
    if (!changed) return errorResponse(404, "No pending seat for that email");
    return json({ email: newEmail });
  });
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<Response> {
  const { orgId } = await params;
  return withOrgScope(request, orgId, async ({ principal, membership }) => {
    if (!(await canManageOrg(orgId, principal.userId, membership.isOwner))) {
      return errorResponse(403, "You do not have permission to manage members of this org");
    }

    const fromQuery = new URL(request.url).searchParams.get("email");
    let email = fromQuery?.trim().toLowerCase() ?? "";
    if (!email) {
      const body = await readJsonBody(request);
      if (body.ok) {
        const value = body.value as { email?: unknown };
        if (typeof value.email === "string") email = value.email.trim().toLowerCase();
      }
    }
    if (!EMAIL_PATTERN.test(email)) return errorResponse(400, "A valid email address is required");

    const removed = await revokePendingSeat(orgId, email, principal);
    if (!removed) return errorResponse(404, "No pending seat for that email");
    return json({ removed: true, email });
  });
}
