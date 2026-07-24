import type { Principal } from './auth';

export type AuthorizationDecision =
  | { allowed: true }
  | { allowed: false; status: 401 | 403; error: 'Not authenticated' | 'Forbidden' };

export function ownsResource(principal: Principal | null | undefined, ownerId: string): boolean {
  return Boolean(principal && ownerId && principal.userId === ownerId);
}

export function requireOwnership(principal: Principal | null | undefined, ownerId: string): AuthorizationDecision {
  if (!principal) return { allowed: false, status: 401, error: 'Not authenticated' };
  if (!ownsResource(principal, ownerId)) return { allowed: false, status: 403, error: 'Forbidden' };
  return { allowed: true };
}

/** Always derive Mongo ownership filters from the verified principal. */
export function ownerFilter(principal: Principal | null | undefined): { ownerId: string } | null {
  return principal ? { ownerId: principal.userId } : null;
}
