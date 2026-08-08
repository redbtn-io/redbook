// Server-side sanitization for the CRM lead -> email automation path.
//
// The POST /send endpoint interpolates untrusted lead-form fields (name,
// source, img) into an HTML email that is sent FROM a trusted sender identity
// (process.env.EMAIL_USER). Interpolating those values raw lets a submitter:
//   - inject arbitrary markup (phishing links, spoofed content) via name/source,
//   - break out of the previously *unquoted* `<img src=...>` attribute via img
//     (e.g. `x onerror=... ` or `x><a href=...>`).
// The webapp cannot be the trust boundary here: anyone can POST JSON to /send
// directly, bypassing the form. All validation/escaping therefore lives here,
// server-side.

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** HTML-escape a value for safe interpolation into element text or a quoted attribute. */
export const escapeHtml = (value: unknown): string =>
  String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);

// Basic single-address email validation. Mirrors the frontend regex so a
// comma/space-separated recipient list (which nodemailer would happily expand
// into multiple recipients — an open-relay / spam vector) is rejected here too.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmailAddress = (email: unknown): email is string =>
  typeof email === 'string' && EMAIL_REGEX.test(email.trim());

// Only allow inline base64 raster images (what the webapp uploads) or https
// URLs. Rejects javascript:/data:text/html, SVG (can carry scripts), and any
// value with quotes/angle-brackets/whitespace that could break out of the
// quoted src attribute.
const DATA_IMAGE_REGEX =
  /^data:image\/(png|jpe?g|gif|webp|bmp);base64,[a-z0-9+/=]+$/i;
const HTTPS_IMAGE_REGEX = /^https:\/\/[^\s"'<>]+$/i;

/** Return a safe `src` value for the email <img>, or null if it isn't allowed. */
export const sanitizeImageSrc = (img: unknown): string | null => {
  if (typeof img !== 'string') return null;
  const trimmed = img.trim();
  if (DATA_IMAGE_REGEX.test(trimmed) || HTTPS_IMAGE_REGEX.test(trimmed)) {
    return trimmed;
  }
  return null;
};

export interface EmailContent {
  name: string;
  source: string;
  /** A src that has already passed sanitizeImageSrc(). */
  img: string;
}

/** Build the lead email HTML with every untrusted field HTML-escaped. */
export const buildEmailHtml = ({ name, source, img }: EmailContent): string =>
  `<p>Hi ${escapeHtml(name)} it's George with NILICO. Blah blah blah your union ${escapeHtml(
    source,
  )} is offering you a benefit.</p> \n <img src="${escapeHtml(img)}" />`;

export interface SendPayload {
  email: string;
  name: string;
  source: string;
  img: string;
}

export type ValidationResult =
  | { ok: true; value: SendPayload }
  | { ok: false; error: string };

/**
 * Validate + normalize the untrusted /send JSON body. Preserves the original
 * "missing required fields" contract, then enforces types, a single valid
 * recipient, and an allow-listed image src.
 */
export const validateSendPayload = (body: unknown): ValidationResult => {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Invalid request body' };
  }

  const { email, name, source, img } = body as Record<string, unknown>;
  const normalizedEmail = typeof email === 'string' ? email.trim() : '';
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  const normalizedSource = typeof source === 'string' ? source.trim() : '';
  const normalizedImg = typeof img === 'string' ? img.trim() : '';

  if (!normalizedEmail || !normalizedName || !normalizedSource || !normalizedImg) {
    return {
      ok: false,
      error: 'Missing required fields: email, name, source, or img',
    };
  }

  if (typeof name !== 'string' || typeof source !== 'string') {
    return { ok: false, error: 'Invalid field types: name and source must be strings' };
  }

  if (!isValidEmailAddress(normalizedEmail)) {
    return { ok: false, error: 'Invalid email address' };
  }

  const safeImg = sanitizeImageSrc(normalizedImg);
  if (!safeImg) {
    return {
      ok: false,
      error: 'Invalid image: must be a base64 image or https URL',
    };
  }

  return {
    ok: true,
    value: {
      email: normalizedEmail,
      name: normalizedName,
      source: normalizedSource,
      img: safeImg,
    },
  };
};
