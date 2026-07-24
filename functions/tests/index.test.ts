import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'net';

import { createApplicationServer, MAX_BODY_BYTES, parseRequestBody, server } from '../index';
import { loadRuntimeConfig } from '../config';
import { createJWT } from '@redbtn/redauth';

describe('parseRequestBody', () => {
  it('parses valid JSON payloads', () => {
    expect(
      parseRequestBody('{"email":"lead@example.com","name":"Jane","source":"Landing","img":"data:image/png;base64,abcd"}'),
    ).toEqual({
      ok: true,
      value: {
        email: 'lead@example.com',
        name: 'Jane',
        source: 'Landing',
        img: 'data:image/png;base64,abcd',
      },
    });
  });

  it('returns an explicit 400-style validation failure for invalid JSON', () => {
    expect(parseRequestBody('{bad-json}')).toEqual({
      ok: false,
      error: 'Invalid JSON payload',
    });
  });
});

describe('POST /send (HTTP boundary)', () => {
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('returns HTTP 400 with the expected error shape for a malformed JSON body', async () => {
    const res = await fetch(`${baseUrl}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad-json}',
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid JSON payload' });
  });

  it('rejects a request body larger than MAX_BODY_BYTES with 413 instead of buffering it', async () => {
    const oversizedImg = 'a'.repeat(MAX_BODY_BYTES + 1);
    const res = await fetch(`${baseUrl}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'lead@example.com',
        name: 'Jane',
        source: 'Landing',
        img: oversizedImg,
      }),
    });

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({ error: 'Payload too large' });
  });
});

describe('protected CRM API boundary', () => {
  let protectedServer: ReturnType<typeof createApplicationServer>;
  let baseUrl: string;

  beforeAll(async () => {
    const config = loadRuntimeConfig({
      ...process.env,
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-for-http',
      REDBOOK_SECRETS_ENCRYPTION_KEY: 'a'.repeat(64),
    });
    protectedServer = createApplicationServer({ config });
    await new Promise<void>((resolve) => protectedServer.listen(0, resolve));
    const { port } = protectedServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      protectedServer.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('rejects missing sessions and does not expose a client-supplied identity', async () => {
    const res = await fetch(`${baseUrl}/api/me`, {
      headers: { 'X-User-Id': 'user-attacker' },
    });
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Not authenticated' });
  });

  it('returns only the authenticated principal', async () => {
    const token = createJWT({ userId: 'user-alice', email: 'alice@example.com' }, 'test-secret-for-http', 60);
    const res = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      principal: { userId: 'user-alice', email: 'alice@example.com' },
    });
  });

  it('exposes safe runtime config and a non-secret health shape', async () => {
    const configRes = await fetch(`${baseUrl}/api/config`);
    expect(configRes.status).toBe(200);
    const configBody = await configRes.json();
    expect(configBody.auth.provider).toBe('@redbtn/red auth');
    expect(JSON.stringify(configBody)).not.toContain('test-secret');

    const healthRes = await fetch(`${baseUrl}/healthz`);
    expect([200, 503]).toContain(healthRes.status);
    await expect(healthRes.json()).resolves.toMatchObject({ service: 'redbook-functions', mongo: { connected: false } });
  });
});
