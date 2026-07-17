import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'net';

import { parseRequestBody, server } from '../index';

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
});
