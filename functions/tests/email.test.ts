import { describe, expect, it } from 'vitest';

import {
  buildEmailHtml,
  escapeHtml,
  isValidEmailAddress,
  sanitizeImageSrc,
  validateSendPayload,
} from '../email';

const VALID_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

describe('escapeHtml', () => {
  it('escapes all HTML-significant characters', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('leaves benign text untouched', () => {
    expect(escapeHtml('Jane Doe')).toBe('Jane Doe');
  });
});

describe('isValidEmailAddress', () => {
  it('accepts a single well-formed address', () => {
    expect(isValidEmailAddress('user@example.com')).toBe(true);
  });

  it('rejects multi-recipient / injected recipient lists', () => {
    // A comma/space list would let nodemailer fan out to extra recipients.
    expect(isValidEmailAddress('a@b.com, victim@evil.com')).toBe(false);
    expect(isValidEmailAddress('a@b.com\nbcc: victim@evil.com')).toBe(false);
    expect(isValidEmailAddress('not-an-email')).toBe(false);
    expect(isValidEmailAddress(42)).toBe(false);
  });
});

describe('sanitizeImageSrc', () => {
  it('accepts base64 raster data URLs and https URLs', () => {
    expect(sanitizeImageSrc(VALID_IMG)).toBe(VALID_IMG);
    expect(sanitizeImageSrc('https://cdn.example.com/logo.png')).toBe(
      'https://cdn.example.com/logo.png',
    );
  });

  it('rejects attribute-injection / script payloads', () => {
    // The original template rendered `<img src=${img} />` UNQUOTED, so these
    // would break out of the tag. They must all be rejected.
    expect(sanitizeImageSrc('x onerror=alert(1)')).toBeNull();
    expect(sanitizeImageSrc('x><script>alert(1)</script>')).toBeNull();
    expect(sanitizeImageSrc('javascript:alert(1)')).toBeNull();
    expect(sanitizeImageSrc('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(sanitizeImageSrc('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBeNull();
    expect(sanitizeImageSrc('http://insecure.example.com/a.png')).toBeNull();
    expect(sanitizeImageSrc(null)).toBeNull();
  });
});

describe('buildEmailHtml', () => {
  it('neutralizes HTML injection in name and source', () => {
    const html = buildEmailHtml({
      name: '<script>alert(1)</script>',
      source: '"><img src=x onerror=alert(1)>',
      img: VALID_IMG,
    });

    // No raw, executable markup from the untrusted fields survives.
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('onerror=alert(1)>');
    // The payloads appear only in escaped form.
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
    // The sanitized image is emitted inside a quoted attribute.
    expect(html).toContain(`<img src="${VALID_IMG}" />`);
  });
});

describe('validateSendPayload', () => {
  const base = {
    email: 'lead@example.com',
    name: 'Jane',
    source: 'Landing',
    img: VALID_IMG,
  };

  it('accepts and normalizes a valid payload', () => {
    const result = validateSendPayload({ ...base, email: '  lead@example.com  ' });
    expect(result).toEqual({ ok: true, value: base });
  });

  it('preserves the missing-required-fields contract', () => {
    const result = validateSendPayload({ ...base, name: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Missing required fields/);
    }
  });

  it('treats whitespace-only image data as missing required fields', () => {
    const result = validateSendPayload({ ...base, img: ' \n\t ' });
    expect(result).toEqual({
      ok: false,
      error: 'Missing required fields: email, name, source, or img',
    });
  });

  it('rejects an invalid recipient address', () => {
    const result = validateSendPayload({ ...base, email: 'a@b.com, victim@evil.com' });
    expect(result).toEqual({ ok: false, error: 'Invalid email address' });
  });

  it('rejects a disallowed image src', () => {
    const result = validateSendPayload({ ...base, img: 'x onerror=alert(1)' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Invalid image/);
    }
  });

  it('rejects a non-object body', () => {
    expect(validateSendPayload('nope').ok).toBe(false);
    expect(validateSendPayload(null).ok).toBe(false);
  });
});
