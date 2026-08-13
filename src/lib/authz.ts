import type { Principal } from "@/lib/session";

/**
 * Authorization vocabulary for redBook.
 *
 * The access boundary is the ORGANIZATION. One org is one shared book of
 * business: every member of an org sees and edits the same clients, contacts,
 * notes, and interactions. `createdBy` on a record is authorship for audit and
 * attribution — it is deliberately NOT a permission check, because a CRM where
 * a colleague cannot edit a client you typed in is not a shared book.
 *
 * The invariant that matters: an org filter is only ever derived from a
 * membership already proven against redOrg for THIS principal, never from a
 * request parameter. A route that accepted `?orgId=` at face value would hand
 * one tenant's pipeline to anyone who guessed an id.
 */

export type AuthorizationDecision =
  | { allowed: true }
  | { allowed: false; status: 401 | 403; error: "Not authenticated" | "Forbidden" };

/** A membership proven against redOrg. Only `resolveMemberships` produces these. */
export interface OrgMembership {
  orgId: string;
  orgName: string;
  orgSlug: string;
  /** True when the principal owns the org. */
  isOwner: boolean;
}

export function requireAuthenticated(principal: Principal | null | undefined): AuthorizationDecision {
  return principal ? { allowed: true } : { allowed: false, status: 401, error: "Not authenticated" };
}

/**
 * Authorize access to an org. `memberships` must be the list resolved from
 * redOrg for this principal; that is the whole guarantee, which is why
 * callers get it from `resolveActiveOrg` rather than assembling one.
 */
export function requireOrgAccess(
  principal: Principal | null | undefined,
  orgId: string,
  memberships: readonly OrgMembership[],
): AuthorizationDecision {
  if (!principal) return { allowed: false, status: 401, error: "Not authenticated" };
  if (!orgId) return { allowed: false, status: 403, error: "Forbidden" };
  return memberships.some((membership) => membership.orgId === orgId)
    ? { allowed: true }
    : { allowed: false, status: 403, error: "Forbidden" };
}

/**
 * The Mongo filter every CRM read and write must carry. Taking an
 * `OrgMembership` rather than a bare string is the point: the type can only
 * be obtained by proving membership first.
 */
export function orgFilter(membership: OrgMembership): { orgId: string } {
  return { orgId: membership.orgId };
}

/**
 * Throws rather than returning an unscoped filter. An accidental `{}` here
 * would read every tenant's records at once.
 */
export function requireOrgFilter(membership: OrgMembership | null | undefined): { orgId: string } {
  if (!membership?.orgId) throw new Error("requireOrgFilter called without a proven org membership");
  return { orgId: membership.orgId };
}

// ------------------------------------------------------- authorship helpers

/**
 * Authorship, retained from the original functions service. Used for
 * attribution and audit — never as the access boundary, which is org
 * membership above.
 */
export function ownsResource(principal: Principal | null | undefined, createdBy: string): boolean {
  return Boolean(principal && createdBy && principal.userId === createdBy);
}

export function requireOwnership(
  principal: Principal | null | undefined,
  createdBy: string,
): AuthorizationDecision {
  if (!principal) return { allowed: false, status: 401, error: "Not authenticated" };
  if (!ownsResource(principal, createdBy)) return { allowed: false, status: 403, error: "Forbidden" };
  return { allowed: true };
}
