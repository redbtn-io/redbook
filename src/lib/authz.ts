import type { Principal } from "@/lib/session";

/**
 * Authorization vocabulary for redBook.
 *
 * Ownership is PER USER: every CRM record carries the `userId` of the
 * principal that created it, and every read and write is filtered by that id.
 * There is deliberately no org/tenant layer — this is a personal book of
 * business, and adding a sharing model before anyone has asked for one would
 * be scope nobody can validate.
 *
 * The invariant that matters: an owner filter is only ever derived from a
 * VERIFIED principal, never from a request parameter. A route that accepted
 * `?ownerId=` would hand every record in the database to anyone who guessed
 * an id, so the filter is constructed here and nowhere else.
 */

export type AuthorizationDecision =
  | { allowed: true }
  | { allowed: false; status: 401 | 403; error: "Not authenticated" | "Forbidden" };

export function ownsResource(principal: Principal | null | undefined, ownerId: string): boolean {
  return Boolean(principal && ownerId && principal.userId === ownerId);
}

export function requireOwnership(
  principal: Principal | null | undefined,
  ownerId: string,
): AuthorizationDecision {
  if (!principal) return { allowed: false, status: 401, error: "Not authenticated" };
  if (!ownsResource(principal, ownerId)) return { allowed: false, status: 403, error: "Forbidden" };
  return { allowed: true };
}

/** The Mongo filter every CRM read and write must carry. */
export function ownerFilter(principal: Principal | null | undefined): { ownerId: string } | null {
  return principal ? { ownerId: principal.userId } : null;
}

/**
 * Non-null owner filter for code paths that already hold a verified
 * principal. Throws rather than returning an unscoped filter, because an
 * accidental `{}` here would be a full-database read.
 */
export function requireOwnerFilter(principal: Principal): { ownerId: string } {
  const filter = ownerFilter(principal);
  if (!filter) throw new Error("requireOwnerFilter called without a verified principal");
  return filter;
}
