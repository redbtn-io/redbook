import { describe, expect, it } from 'vitest';
import { createJWT } from '@redbtn/redauth';

import { resolvePrincipal } from '../auth';

const SECRET = 'test-secret-for-redbook';

describe('redAuth session boundary', () => {
  it('rejects missing and invalid sessions', () => {
    expect(resolvePrincipal({}, { jwtSecret: SECRET }).principal).toBeNull();
    expect(resolvePrincipal({ authorization: 'Bearer invalid' }, { jwtSecret: SECRET }).principal).toBeNull();
    expect(resolvePrincipal({ authorization: 'Basic invalid' }, { jwtSecret: SECRET }).principal).toBeNull();
  });

  it('exposes only the verified principal for a Bearer session', () => {
    const token = createJWT(
      { userId: 'user-alice', email: 'alice@example.com', accountLevel: 4, sid: 'session-1' },
      SECRET,
      60,
    );
    expect(resolvePrincipal({ authorization: `Bearer ${token}` }, { jwtSecret: SECRET })).toEqual({
      configured: true,
      principal: {
        userId: 'user-alice',
        email: 'alice@example.com',
        accountLevel: 4,
        sid: 'session-1',
      },
    });
  });

  it('accepts the shared red_session cookie', () => {
    const token = createJWT({ userId: 'user-cookie', email: 'cookie@example.com' }, SECRET, 60);
    expect(resolvePrincipal({ cookie: `red_session=${token}` }, { jwtSecret: SECRET })).toEqual({
      configured: true,
      principal: { userId: 'user-cookie', email: 'cookie@example.com' },
    });
  });

  it('fails closed when an invalid Bearer header accompanies a valid cookie', () => {
    const token = createJWT({ userId: 'user-cookie', email: 'cookie@example.com' }, SECRET, 60);
    expect(
      resolvePrincipal(
        { authorization: 'Bearer invalid', cookie: `red_session=${token}` },
        { jwtSecret: SECRET },
      ).principal,
    ).toBeNull();
  });
});
