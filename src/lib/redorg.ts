import "server-only";

import { createRedOrg, type RedOrgInstance } from "@redbtn/redorg";

import { getConfig } from "@/lib/config";
import { connectMongo } from "@/lib/mongo";
import { resolveUserIdsByEmail } from "@/lib/directory";
import { logInfo, logWarn } from "@/lib/logging";
import type { OrgMembership } from "@/lib/authz";
import type { Principal } from "@/lib/session";

/**
 * redBook's organization layer, powered by `@redbtn/redorg`.
 *
 * An org is a TENANT: one org is one shared book of business, visible to
 * every member of that org. This is the access boundary for the whole app —
 * `ownerId`/`createdBy` on a record is authorship for audit, not permission.
 *
 * redOrg is consumed as a LIBRARY (it is a mongoose package, not a service),
 * pointed at redBook's own `redbook` database with the default `org_`
 * collection prefix. Its orgs are redBook tenants, not the fleet directory,
 * so slugs stay local and cannot collide with another app's.
 *
 * Lazy singleton: `createRedOrg()` only resolves config and does not touch
 * Mongo until an operation awaits a connection, so `next build` with no
 * runtime env still compiles.
 */
let instance: RedOrgInstance | null = null;

export function getRedOrg(): RedOrgInstance {
  if (!instance) {
    instance = createRedOrg({
      mongoUri: getConfig().mongoUri,
      appName: "redbook",
      defaultOrgSettings: {
        // No team/group UI ships here, so this has no observable effect today.
        // Setting it now means a later team feature inherits org permissions
        // by default rather than silently not cascading.
        cascadeOrgPermissions: true,
      },
    });
  }
  return instance;
}

/** Test seam. */
export function resetRedOrg(): void {
  instance = null;
}

interface OrgDoc {
  _id: unknown;
  name?: string;
  slug?: string;
  ownerId?: unknown;
}

function toMembership(org: OrgDoc, userId: string): OrgMembership {
  return {
    orgId: String(org._id),
    orgName: org.name || "Untitled org",
    orgSlug: org.slug || "",
    isOwner: String(org.ownerId ?? "") === userId,
  };
}

/**
 * Every org this principal actually belongs to, from redOrg.
 *
 * This is the ONLY source of org authority in the app. A route never trusts
 * an `orgId` from the request until it has been matched against this list.
 */
export async function resolveMemberships(principal: Principal): Promise<OrgMembership[]> {
  const orgs = (await getRedOrg().getUserOrgs(principal.userId)) as unknown as OrgDoc[];
  return orgs.map((org) => toMembership(org, principal.userId));
}

// ------------------------------------------------------- pending membership

interface PendingMember {
  email: string;
  orgId: string;
  createdAt: string;
}

/**
 * A seeded member whose ecosystem identity does not exist yet.
 *
 * redOrg keys membership by `userId`, and redBook will not mint identities in
 * the shared directory just to seed a placeholder. So an email that does not
 * resolve is parked here and converted into a real membership the first time
 * someone signs in with it. Updating the placeholder is a one-row edit (or a
 * change to `REDBOOK_ORG_MEMBER_EMAILS`), which is the "easy to update"
 * property we want while Josh's real address is unknown.
 */
async function pendingCollection() {
  const db = await connectMongo();
  return db.collection<PendingMember>("org_pending_members");
}

export async function addPendingMember(email: string, orgId: string): Promise<void> {
  const collection = await pendingCollection();
  await collection.updateOne(
    { email: email.toLowerCase(), orgId },
    { $setOnInsert: { email: email.toLowerCase(), orgId, createdAt: new Date().toISOString() } },
    { upsert: true },
  );
}

export async function listPendingMembers(orgId: string): Promise<PendingMember[]> {
  const collection = await pendingCollection();
  return collection.find({ orgId }).toArray();
}

/**
 * Convert a pending row into real membership when its person finally appears.
 * Returns the org they joined, if any.
 */
async function claimPendingMembership(principal: Principal): Promise<OrgMembership | null> {
  const collection = await pendingCollection();
  const pending = await collection.findOne({ email: principal.email.toLowerCase() });
  if (!pending) return null;

  const redOrg = getRedOrg();
  const org = (await redOrg.getOrg(pending.orgId)) as unknown as OrgDoc | null;
  if (!org) {
    await collection.deleteOne({ email: pending.email, orgId: pending.orgId });
    return null;
  }

  await addMemberToOrg(pending.orgId, principal.userId, String(org.ownerId ?? principal.userId));
  await collection.deleteOne({ email: pending.email, orgId: pending.orgId });
  logInfo("Pending member claimed their seat", { orgId: pending.orgId, email: pending.email });
  return toMembership(org, principal.userId);
}

// ------------------------------------------------------------- bootstrapping

/** Add a user to an org as a plain member, tolerating an existing membership. */
async function addMemberToOrg(orgId: string, userId: string, actorId: string): Promise<void> {
  const redOrg = getRedOrg();
  try {
    const existing = await redOrg.getMember("org", orgId, userId);
    if (existing) return;
    const roles = (await redOrg.getRoles("org", orgId)) as unknown as Array<{ _id: unknown; slug?: string }>;
    const memberRole = roles.find((role) => role.slug === "member");
    await redOrg.addMember("org", orgId, userId, memberRole ? [String(memberRole._id)] : [], actorId);
  } catch (error) {
    logWarn("Could not add org member", {
      orgId,
      userId,
      error: error instanceof Error ? error.message : "unknown error",
    });
  }
}

/**
 * Create the default org and seat its configured members.
 *
 * Ownership goes to the first configured email that actually resolves in the
 * directory (George), falling back to whoever triggered the bootstrap — so
 * the org is not accidentally owned by a passing service principal.
 */
async function createDefaultOrg(principal: Principal): Promise<OrgMembership> {
  const config = getConfig();
  const redOrg = getRedOrg();

  const resolved = await resolveUserIdsByEmail(config.orgMemberEmails, config);
  const ownerId =
    config.orgMemberEmails.map((email) => resolved.get(email)).find(Boolean) || principal.userId;

  const { org } = await redOrg.createOrg(
    { name: config.defaultOrgName, slug: config.defaultOrgSlug },
    ownerId,
  );
  const orgId = String((org as unknown as OrgDoc)._id);

  for (const email of config.orgMemberEmails) {
    const userId = resolved.get(email);
    if (userId) {
      if (userId !== ownerId) await addMemberToOrg(orgId, userId, ownerId);
    } else {
      await addPendingMember(email, orgId);
    }
  }

  logInfo("Bootstrapped the default org", {
    orgId,
    slug: config.defaultOrgSlug,
    ownerId,
    seated: [...resolved.keys()],
    pending: config.orgMemberEmails.filter((email) => !resolved.has(email)),
  });
  return toMembership(org as unknown as OrgDoc, principal.userId);
}

/**
 * Resolve the org a request operates in.
 *
 * Order matters: real memberships first, then a pending seat being claimed,
 * then the shared default org, and only then a fresh bootstrap. Anything else
 * risks a second org being created for someone who should have joined the
 * existing one.
 */
export async function resolveActiveOrg(
  principal: Principal,
  requestedOrgId?: string | null,
): Promise<{ membership: OrgMembership; memberships: OrgMembership[] } | null> {
  let memberships = await resolveMemberships(principal);

  if (memberships.length === 0) {
    const claimed = await claimPendingMembership(principal);
    if (claimed) {
      memberships = await resolveMemberships(principal);
    } else {
      const config = getConfig();
      const existing = (await getRedOrg().getOrgBySlug(config.defaultOrgSlug)) as unknown as OrgDoc | null;
      if (existing) {
        // The default org exists but this principal is not in it. Joining is
        // NOT automatic: that would make every ecosystem account a member of
        // George's book. They get their own org instead.
        if (config.orgMemberEmails.includes(principal.email.toLowerCase())) {
          await addMemberToOrg(String(existing._id), principal.userId, String(existing.ownerId ?? principal.userId));
          memberships = await resolveMemberships(principal);
        } else {
          const { org } = await getRedOrg().createOrg(
            { name: `${principal.email}'s book`, slug: `book-${principal.userId.slice(-8)}` },
            principal.userId,
          );
          memberships = [toMembership(org as unknown as OrgDoc, principal.userId)];
        }
      } else {
        memberships = [await createDefaultOrg(principal)];
      }
    }
  }

  if (memberships.length === 0) return null;

  if (requestedOrgId) {
    const match = memberships.find((membership) => membership.orgId === requestedOrgId);
    if (!match) return null;
    return { membership: match, memberships };
  }
  return { membership: memberships[0], memberships };
}
