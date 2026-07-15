import { describe, expect, it } from 'vitest';

import { buildSubmissionPayload, isValidEmail } from '../src/form';

describe('CRM form helpers', () => {
  it('validates email addresses', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('user+tag@sub.domain.org')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
  });

  it('builds trimmed payload for submission', () => {
    expect(
      buildSubmissionPayload({
        name: ' Jane Doe ',
        email: ' jane@doe.com ',
        source: ' Landing ',
        img: 'data:image/png;base64,abcd',
      }),
    ).toEqual({
      name: 'Jane Doe',
      email: 'jane@doe.com',
      source: 'Landing',
      img: 'data:image/png;base64,abcd',
    });
  });
});
