import { describe, expect, it } from 'vitest';

import { ownsResource, ownerFilter, requireOwnership } from '../authz';
import type { Principal } from '../auth';

const alice: Principal = { userId: 'user-alice', email: 'alice@example.com' };

describe('CRM ownership authorization', () => {
  it('denies unauthenticated access', () => {
    expect(ownsResource(null, 'user-alice')).toBe(false);
    expect(requireOwnership(null, 'user-alice')).toEqual({
      allowed: false,
      status: 401,
      error: 'Not authenticated',
    });
    expect(ownerFilter(null)).toBeNull();
  });

  it('denies cross-user access', () => {
    expect(ownsResource(alice, 'user-bob')).toBe(false);
    expect(requireOwnership(alice, 'user-bob')).toEqual({
      allowed: false,
      status: 403,
      error: 'Forbidden',
    });
  });

  it('derives an ownership filter from the verified principal', () => {
    expect(ownsResource(alice, 'user-alice')).toBe(true);
    expect(requireOwnership(alice, 'user-alice')).toEqual({ allowed: true });
    expect(ownerFilter(alice)).toEqual({ ownerId: 'user-alice' });
  });
});
