import { Shell } from "@/components/Shell";
import { MembersView } from "@/components/MembersView";
import { requirePrincipal } from "@/lib/server-session";
import { resolvePageOrg } from "@/lib/active-org";
import {
  getOrgPermissions,
  listInvitableRoles,
  listOrgMembers,
  listPendingMembers,
} from "@/lib/redorg";

export const dynamic = "force-dynamic";

/**
 * The members and seats surface for the active org, read from the shared
 * redOrg directory: real memberships, and separately the pending seats
 * that are still waiting for someone to sign in with the right email.
 */
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string | string[] }>;
}) {
  const principal = await requirePrincipal("/members");
  const { org } = await searchParams;
  const resolved = await resolvePageOrg(principal, org);
  if (!resolved) {
    return (
      <Shell email={principal.email}>
        <p className="text-text-secondary">You are not a member of any book yet.</p>
      </Shell>
    );
  }

  const { membership, memberships } = resolved;
  const orgId = membership.orgId;
  const [members, pending, roles, permissions] = await Promise.all([
    listOrgMembers(orgId),
    listPendingMembers(orgId),
    listInvitableRoles(orgId),
    getOrgPermissions(orgId, principal.userId),
  ]);

  return (
    <Shell
      email={principal.email}
      orgName={membership.orgName}
      orgCount={memberships.length}
      orgs={memberships}
      activeOrgId={orgId}
      breadcrumb="Members"
    >
      <MembersView
        orgId={orgId}
        orgName={membership.orgName}
        currentUserId={principal.userId}
        members={members.map((member) => ({ ...member, email: member.email ?? "Unknown" }))}
        pendingSeats={pending.map((seat) => ({
          email: seat.email,
          roleSlug: seat.roleSlug ?? "member",
          createdAt: seat.createdAt,
        }))}
        roles={roles}
        canInvite={membership.isOwner || permissions.includes("org:invite_members")}
        canManage={membership.isOwner || permissions.includes("org:manage_members")}
      />
    </Shell>
  );
}
