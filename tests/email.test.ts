import { describe, expect, it } from "vitest";

import {
  buildEmailHtml,
  escapeHtml,
  isValidEmailAddress,
  sanitizeImageSrc,
  validateSendPayload,
} from "@/lib/email";

/**
 * POST /send is public: anyone can post JSON to it directly, bypassing any
 * form. These cases are the trust boundary for an email sent from a trusted
 * sender identity.
 */
describe("escapeHtml", () => {
  it("escapes every character that could break out of markup or an attribute", () => {
    expect(escapeHtml(`<script>&"'`)).toBe("&lt;script&gt;&amp;&quot;&#39;");
  });
});

describe("isValidEmailAddress", () => {
  it("accepts a single address", () => {
    expect(isValidEmailAddress("dana@example.com")).toBe(true);
  });

  it("rejects a recipient list, which nodemailer would expand into a relay", () => {
    expect(isValidEmailAddress("a@example.com,b@example.com")).toBe(false);
    expect(isValidEmailAddress("a@example.com b@example.com")).toBe(false);
  });

  it("rejects non-strings and malformed values", () => {
    expect(isValidEmailAddress(42)).toBe(false);
    expect(isValidEmailAddress("no-at-sign")).toBe(false);
  });
});

describe("sanitizeImageSrc", () => {
  it("allows inline base64 rasters and https URLs", () => {
    expect(sanitizeImageSrc("data:image/png;base64,iVBORw0KGgo=")).toBeTruthy();
    expect(sanitizeImageSrc("https://example.com/a.png")).toBe("https://example.com/a.png");
  });

  it("rejects SVG, javascript:, and attribute-breaking values", () => {
    expect(sanitizeImageSrc("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
    expect(sanitizeImageSrc("javascript:alert(1)")).toBeNull();
    expect(sanitizeImageSrc('x" onerror="alert(1)')).toBeNull();
    expect(sanitizeImageSrc("http://example.com/a.png")).toBeNull();
  });
});

describe("validateSendPayload", () => {
  const valid = {
    email: "dana@example.com",
    name: "Dana",
    source: "union",
    img: "https://example.com/a.png",
  };

  it("accepts a well-formed payload", () => {
    expect(validateSendPayload(valid)).toEqual({ ok: true, value: valid });
  });

  it("preserves the missing-fields contract", () => {
    const result = validateSendPayload({ email: "dana@example.com" });
    expect(result).toEqual({
      ok: false,
      error: "Missing required fields: email, name, source, or img",
    });
  });

  it("rejects a non-object body", () => {
    expect(validateSendPayload("nope").ok).toBe(false);
    expect(validateSendPayload(null).ok).toBe(false);
  });

  it("rejects non-string name/source", () => {
    expect(validateSendPayload({ ...valid, name: { toString: () => "x" } }).ok).toBe(false);
  });
});

describe("buildEmailHtml", () => {
  it("escapes every interpolated field", () => {
    const html = buildEmailHtml({
      name: '<script>alert(1)</script>',
      source: '"><a href="https://evil.example">',
      img: "https://example.com/a.png",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('href="https://evil.example"');
  });

  it("keeps the img src inside its quoted attribute", () => {
    const html = buildEmailHtml({ name: "Dana", source: "union", img: "https://example.com/a.png" });
    expect(html).toContain('<img src="https://example.com/a.png" />');
  });
});
