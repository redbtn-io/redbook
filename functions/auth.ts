import { verifyJWT, verifySessionCookie, type JWTPayload } from '@redbtn/redauth';

import type { IncomingHttpHeaders } from 'node:http';

export interface Principal {
  userId: string;
  email: string;
  accountLevel?: number;
  sid?: string;
}

export interface AuthResult {
  principal: Principal | null;
  configured: boolean;
}

function headerValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function principalFromPayload(payload: JWTPayload | null): Principal | null {
  if (!payload || typeof payload.userId !== 'string' || typeof payload.email !== 'string') return null;
  const accountLevel = typeof payload.accountLevel === 'number' && Number.isFinite(payload.accountLevel)
    ? payload.accountLevel
    : undefined;
  return {
    userId: payload.userId,
    email: payload.email,
    ...(accountLevel === undefined ? {} : { accountLevel }),
    ...(payload.sid === undefined ? {} : { sid: payload.sid }),
  };
}

/**
 * Verify exactly the shared redAuth session transports. No user identity is
 * accepted from a client header, and an invalid Authorization header never
 * falls back to an ambient cookie.
 */
export function resolvePrincipal(
  headers: IncomingHttpHeaders,
  options: { jwtSecret?: string; cookieName?: string },
): AuthResult {
  if (!options.jwtSecret) return { principal: null, configured: false };

  const authorization = headerValue(headers.authorization);
  if (authorization !== null) {
    const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
    return { principal: match ? principalFromPayload(verifyJWT(match[1], options.jwtSecret)) : null, configured: true };
  }

  const cookie = headerValue(headers.cookie);
  return {
    principal: principalFromPayload(
      verifySessionCookie(cookie, { cookieName: options.cookieName || 'red_session', secret: options.jwtSecret }),
    ),
    configured: true,
  };
}
