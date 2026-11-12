import "server-only";

import { Types } from "mongoose";
import { createRedOrg, type RedOrgInstance } from "@redbtn/redorg";

import { getConfig } from "@/lib/config";
import { connectMongo } from "@/lib/mongo";
import { resolvePeopleByUserId, resolveUserIdsByEmail } from "@/lib/directory";
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
 * pointed at the SHARED ecosystem directory, the `redorg` database that
 * redSocial reads and redOffice fronts (Epic 1, November 2026). An org here
 * is the same org in every other app: same id, same members, same roles.
 * redBook's CRM records (clients, contacts, notes, interactions) still live
 * in redBook's own `redbook` database, keyed by the directory org id, which
 * did not change when the silo orgs were bridged into the directory, so no
 * record was remapped or orphaned by the move.
 *
 * The pre-integration silo (the `org_` collections inside the `redbook`
 * database) is frozen history: still on disk as the migration snapshot,
 * never read or written by this code anymore.
 *
 * Lazy singleton: `createRedOrg()` only resolves config and does not touch
 * Mongo until an operation awaits a connection, so `next build` with no
 * runtime env still compiles.
 */
let instance: RedOrgInstance | null = null;

export function getRedOrg(): RedOrgInstance {
  if (!instance) {
    const config = getConfig();
    instance = createRedOrg({
      // Production validation requires REDORG_MONGODB_URI; the fallback to
      // redBook's own database exists only so a local dev checkout without
      // the directory configured behaves the way the pre-integration app
      // did, against a throwaway local Mongo.
      mongoUri: config.redorgMongoUri || config.mongoUri,
      appName: "redbook",
      audit: {
        // Member changes are recorded through explicit `audit()` calls (see
        // recordOrgAudit below). Retention is forever, matching redSocial's
        // setting, so no TTL is baked into the shared directory's models.
        enabled: true,
        auto: false,
        retentionDays: null,
      },
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
  status?: string;
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
 * Every org this principal actually belongs to, from the shared directory.
 *
 * This is the ONLY source of org authority in the app. A route never trusts
 * an `orgId` from the request until it has been matched against this list.
 *
 * Directory orgs carry a lifecycle status (pending, active, suspended) that
 * the old silo never had. Only active orgs are books: a pending org is an
 * unfinished signup in some other app, not a book of business, and a
 * suspended one is closed on purpose. Pre-lifecycle documents with no
 * status at all count as active, which is what the bridged silo orgs were
 * normalized to during migration.
 */
export async function resolveMemberships(principal: Principal): Promise<OrgMembership[]> {
  const orgs = (await getRedOrg().getUserOrgs(principal.userId)) as unknown as OrgDoc[];
  return orgs
    .filter((org) => !org.status || org.status === "active")
    .map((org) => toMembership(org, principal.userId));
}

// ------------------------------------------------- redBook-managed books

interface BookOrgDoc {
  orgId: string;
  source: string;
  createdAt: string;
}

/**
 * The registry of orgs redBook manages as books, kept in redBook's OWN
 * database (collection `book_orgs`). The directory holds every org in the
 * estate, including orgs created by other apps for other purposes. Those
 * orgs are real memberships and appear in the switcher, but redBook only
 * seeds starter clients into books it created or that were bridged in the
 * Epic 1 migration, and only prefers them as the default landing book.
 * Seeding demo clients into another app's org would be vandalism, not
 * integration.
 */
async function bookOrgsCollection() {
  const db = await connectMongo();
  return db.collection<BookOrgDoc>("book_orgs");
}

export async function listBookOrgIds(): Promise<Set<string>> {
  try {
    const collection = await bookOrgsCollection();
    const docs = await collection.find({}).toArray();
    return new Set(docs.map((doc) => doc.orgId));
  } catch (error) {
    logWarn("Could not read the book org registry", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return new Set();
  }
}

export async function isBookOrg(orgId: string): Promise<boolean> {
  const ids = await listBookOrgIds();
  return ids.has(orgId);
}

export async function markBookOrg(orgId: string, source: string): Promise<void> {
  const collection = await bookOrgsCollection();
  await collection.updateOne(
    { orgId },
    { $setOnInsert: { orgId, source, createdAt: new Date().toISOString() } },
    { upsert: true },
  );
}

// ------------------------------------------------------- pending membership

interface PendingMember {
  email: string;
  orgId: string;
  createdAt: string;
  /** Role slug granted when the seat converts. Absent means plain member. */
  roleSlug?: string;
  /** userId of the org member who created the seat, for the audit trail. */
  invitedBy?: string;
}

/**
 * A seated member whose ecosystem identity does not exist yet.
 *
 * redOrg keys membership by `userId`, and redBook will not mint identities in
 * the shared directory just to seed a placeholder. So an email that does not
 * resolve is parked here and converted into a real membership the first time
 * someone signs in with it. The rows live in redBook's own database because
 * they are a redBook seating mechanism, but the `orgId` they carry is the
 * shared directory's org id.
 */
async function pendingCollection() {
  const db = await connectMongo();
  return db.collection<PendingMember>("org_pending_members");
}

export async function addPendingMember(
  email: string,
  orgId: string,
  options?: { roleSlug?: string; invitedBy?: string },
): Promise<void> {
  const collection = await pendingCollection();
  const normalized = email.toLowerCase();
  await collection.updateOne(
    { email: normalized, orgId },
    {
      $setOnInsert: { email: normalized, orgId, createdAt: new Date().toISOString() },
      ...(options?.roleSlug || options?.invitedBy
        ? {
            $set: {
              ...(options.roleSlug ? { roleSlug: options.roleSlug } : {}),
              ...(options.invitedBy ? { invitedBy: options.invitedBy } : {}),
            },
          }
        : {}),
    },
    { upsert: true },
  );
}

export async function listPendingMembers(orgId: string): Promise<PendingMember[]> {
  const collection = await pendingCollection();
  return collection.find({ orgId }).toArray();
}

/**
 * Point a pending seat at a different email. This is the fix for a seat
 * created with a placeholder or a typo: the seat, its org, and its role all
 * survive, only the address it is waiting for changes.
 */
export async function updatePendingMemberEmail(
  orgId: string,
  currentEmail: string,
  newEmail: string,
): Promise<boolean> {
  const collection = await pendingCollection();
  const result = await collection.updateOne(
    { email: currentEmail.toLowerCase(), orgId },
    { $set: { email: newEmail.toLowerCase() } },
  );
  return result.matchedCount > 0;
}

export async function removePendingMember(orgId: string, email: string): Promise<boolean> {
  const collection = await pendingCollection();
  const result = await collection.deleteOne({ email: email.toLowerCase(), orgId });
  return result.deletedCount > 0;
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

  await addMemberToOrg(
    pending.orgId,
    principal.userId,
    String(org.ownerId ?? principal.userId),
    pending.roleSlug || "member",
  );
  await collection.deleteOne({ email: pending.email, orgId: pending.orgId });
  logInfo("Pending member claimed their seat", { orgId: pending.orgId, email: pending.email });
  return toMembership(org, principal.userId);
}

// ------------------------------------------------------------- bootstrapping

/** Add a user to an org with the given role, tolerating an existing membership. */
async function addMemberToOrg(
  orgId: string,
  userId: string,
  actorId: string,
  roleSlug = "member",
): Promise<void> {
  const redOrg = getRedOrg();
  try {
    const existing = await redOrg.getMember("org", orgId, userId);
    if (existing) return;
    const roles = (await redOrg.getRoles("org", orgId)) as unknown as Array<{ _id: unknown; slug?: string }>;
    const role =
      roles.find((candidate) => candidate.slug === roleSlug) ??
      roles.find((candidate) => candidate.slug === "member");
    await redOrg.addMember("org", orgId, userId, role ? [String(role._id)] : [], actorId);
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
 *
 * In the integrated world this only runs on a fresh directory where the
 * default org does not exist yet (a new deployment), never in production:
 * the FinThrive org was bridged into the shared directory by migration.
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
  await markBookOrg(orgId, "bootstrap");

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
 *
 * `requestedRef` may be an org id or an org slug (the redSocial selection
 * pattern: header, query parameter, or cookie, resolved by the caller). It
 * is honoured only when it names an org the principal actually belongs to.
 * With no explicit ref, the default is the principal's own redBook-managed
 * book when they have one, which keeps a person landing in their book
 * rather than in whichever directory org sorts first.
 */
export async function resolveActiveOrg(
  principal: Principal,
  requestedRef?: string | null,
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
          await markBookOrg(String((org as unknown as OrgDoc)._id), "bootstrap");
          memberships = [toMembership(org as unknown as OrgDoc, principal.userId)];
        }
      } else {
        memberships = [await createDefaultOrg(principal)];
      }
    }
  }

  if (memberships.length === 0) return null;

  if (requestedRef) {
    const match = memberships.find(
      (membership) => membership.orgId === requestedRef || membership.orgSlug === requestedRef,
    );
    if (!match) return null;
    return { membership: match, memberships };
  }

  const bookOrgIds = await listBookOrgIds();
  const preferred =
    memberships.find((membership) => bookOrgIds.has(membership.orgId) && membership.isOwner) ??
    memberships.find((membership) => bookOrgIds.has(membership.orgId)) ??
    memberships[0];
  return { membership: preferred, memberships };
}

// ---------------------------------------------------------- members surface

export interface OrgMemberView {
  userId: string;
  email: string | null;
  name: string | null;
  roleSlugs: string[];
  status: string;
  isOwner: boolean;
  joinedAt: string | null;
}

interface MemberDoc {
  userId?: unknown;
  roleIds?: unknown[];
  status?: string;
  joinedAt?: unknown;
  createdAt?: unknown;
}

interface RoleDoc {
  _id: unknown;
  slug?: string;
  name?: string;
  position?: number;
}

async function orgRoles(orgId: string): Promise<RoleDoc[]> {
  return (await getRedOrg().getRoles("org", orgId)) as unknown as RoleDoc[];
}

/** The active org's real memberships, with people resolved from redauth. */
export async function listOrgMembers(orgId: string): Promise<OrgMemberView[]> {
  const redOrg = getRedOrg();
  const org = (await redOrg.getOrg(orgId)) as unknown as OrgDoc | null;
  const ownerId = org ? String(org.ownerId ?? "") : "";
  const { members } = await redOrg.getMembers("org", orgId, { page: 1, limit: 200 });
  const roles = await orgRoles(orgId);
  const roleSlugById = new Map(roles.map((role) => [String(role._id), role.slug || ""]));
  const people = await resolvePeopleByUserId(
    members.map((member) => String((member as unknown as MemberDoc).userId ?? "")),
  );

  const views: OrgMemberView[] = members.map((member) => {
    const doc = member as unknown as MemberDoc;
    const userId = String(doc.userId ?? "");
    const person = people.get(userId);
    return {
      userId,
      email: person?.email ?? null,
      name: person?.name ?? null,
      roleSlugs: (doc.roleIds ?? []).map((id) => roleSlugById.get(String(id)) || "").filter(Boolean),
      status: doc.status || "active",
      isOwner: userId === ownerId,
      joinedAt: doc.joinedAt ? String(doc.joinedAt) : doc.createdAt ? String(doc.createdAt) : null,
    };
  });

  return views.sort((a, b) => {
    if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
    return (a.email ?? a.userId).localeCompare(b.email ?? b.userId);
  });
}

/** Roles an owner may hand out from the members page. Owner itself is never offered. */
export async function listInvitableRoles(orgId: string): Promise<Array<{ slug: string; name: string }>> {
  const roles = await orgRoles(orgId);
  return roles
    .filter((role) => role.slug && role.slug !== "owner")
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
    .map((role) => ({ slug: role.slug as string, name: role.name || (role.slug as string) }));
}

/** The caller's effective permissions in one org, straight from the directory. */
export async function getOrgPermissions(orgId: string, userId: string): Promise<string[]> {
  try {
    return await getRedOrg().getUserPermissions("org", orgId, userId);
  } catch (error) {
    logWarn("Could not resolve org permissions", {
      orgId,
      userId,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return [];
  }
}

/**
 * Record a member change in the directory's own audit log, with who did it.
 * Best effort by design: a failed audit write must never fail the change
 * itself, so it logs and moves on.
 */
async function recordOrgAudit(
  action: "member:added" | "member:removed" | "invite:created" | "invite:revoked",
  orgId: string,
  actorId: string,
  description: string,
  targetId?: string,
): Promise<void> {
  try {
    const scopeId = new Types.ObjectId(orgId);
    await getRedOrg().audit({
      action,
      description,
      actorId,
      actorType: "user",
      scope: "org",
      scopeId,
      organizationId: scopeId,
      targetType: "member",
      targetId,
    });
  } catch (error) {
    logWarn("Could not write org audit entry", {
      orgId,
      action,
      error: error instanceof Error ? error.message : "unknown error",
    });
  }
}

export type InviteOutcome =
  | { outcome: "added"; userId: string }
  | { outcome: "pending" }
  | { outcome: "already-member"; userId: string };

/**
 * Seat a person in an org by email, from the product.
 *
 * If the email already belongs to an ecosystem account, the membership is
 * created immediately with the chosen role. If it does not resolve yet, the
 * seat is parked as a pending member and converts on that person's first
 * sign-in with the exact email, the same mechanism the original FinThrive
 * bootstrap used for Josh's placeholder seat.
 */
export async function inviteOrgMember(
  orgId: string,
  email: string,
  roleSlug: string,
  actor: Principal,
): Promise<InviteOutcome> {
  const normalized = email.toLowerCase();
  const config = getConfig();
  const resolved = await resolveUserIdsByEmail([normalized], config);
  const userId = resolved.get(normalized);

  if (userId) {
    const existing = await getRedOrg().getMember("org", orgId, userId);
    if (existing) return { outcome: "already-member", userId };
    await addMemberToOrg(orgId, userId, actor.userId, roleSlug);
    const created = await getRedOrg().getMember("org", orgId, userId);
    if (created) {
      await recordOrgAudit("member:added", orgId, actor.userId, `Seated ${normalized} with role ${roleSlug}`, userId);
      logInfo("Org member seated by email", { orgId, email: normalized, roleSlug, actorId: actor.userId });
      return { outcome: "added", userId };
    }
  }

  await addPendingMember(normalized, orgId, { roleSlug, invitedBy: actor.userId });
  await recordOrgAudit("invite:created", orgId, actor.userId, `Pending seat created for ${normalized} with role ${roleSlug}`);
  logInfo("Org pending seat created", { orgId, email: normalized, roleSlug, actorId: actor.userId });
  return { outcome: "pending" };
}

/** Change the email a pending seat is waiting for (the Josh placeholder fix). */
export async function changePendingSeatEmail(
  orgId: string,
  currentEmail: string,
  newEmail: string,
  actor: Principal,
): Promise<boolean> {
  const changed = await updatePendingMemberEmail(orgId, currentEmail, newEmail);
  if (changed) {
    await recordOrgAudit(
      "invite:created",
      orgId,
      actor.userId,
      `Pending seat email changed from ${currentEmail.toLowerCase()} to ${newEmail.toLowerCase()}`,
    );
    logInfo("Org pending seat email changed", {
      orgId,
      from: currentEmail.toLowerCase(),
      to: newEmail.toLowerCase(),
      actorId: actor.userId,
    });
  }
  return changed;
}

/** Revoke a pending seat that has not been claimed yet. */
export async function revokePendingSeat(
  orgId: string,
  email: string,
  actor: Principal,
): Promise<boolean> {
  const removed = await removePendingMember(orgId, email);
  if (removed) {
    await recordOrgAudit("invite:revoked", orgId, actor.userId, `Pending seat for ${email.toLowerCase()} revoked`);
    logInfo("Org pending seat revoked", { orgId, email: email.toLowerCase(), actorId: actor.userId });
  }
  return removed;
}

/**
 * Remove a real member from an org. The org owner can never be removed
 * through here: ownership transfer is a different operation with its own
 * flow in the library, and silently orphaning an org's owner would strand
 * every record in it.
 */
export async function removeOrgMember(
  orgId: string,
  userId: string,
  actor: Principal,
): Promise<{ removed: boolean; reason?: string }> {
  const redOrg = getRedOrg();
  const org = (await redOrg.getOrg(orgId)) as unknown as OrgDoc | null;
  if (!org) return { removed: false, reason: "Org not found" };
  if (String(org.ownerId ?? "") === userId) {
    return { removed: false, reason: "The org owner cannot be removed" };
  }
  const existing = await redOrg.getMember("org", orgId, userId);
  if (!existing) return { removed: false, reason: "Not a member of this org" };
  await redOrg.removeMember("org", orgId, userId, actor.userId);
  await recordOrgAudit("member:removed", orgId, actor.userId, `Removed member ${userId}`, userId);
  logInfo("Org member removed", { orgId, userId, actorId: actor.userId });
  return { removed: true };
}
