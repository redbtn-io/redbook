import { describe, expect, it } from 'vitest';

import { parseRequestBody } from '../index';

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
