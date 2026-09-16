/**
 * Where to land after signing in.
 *
 * The landing page at `/` accepts a `next` destination so a deep link can
 * survive the trip through accounts.redbtn.io. That makes `next`
 * attacker-controlled input on an unauthenticated page, which is the classic
 * open-redirect shape: an absolute URL here would resolve straight through
 * `signInUrl`'s `new URL(returnPath, publicUrl)` and let a phishing page send
 * someone through OUR sign-in and back out to their host.
 *
 * So: same-origin relative paths only.
 *
 * Rejected, and why each matters:
 *  - anything not starting with `/`  -> an absolute URL or a relative path
 *  - `//evil.com`, `/\evil.com`      -> protocol-relative URLs; browsers read
 *                                       both as a host, not a path
 *  - control characters              -> header/response splitting
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return null;
  // eslint-disable-next-line no-control-regex -- rejecting control bytes is the point
  if (/[\u0000-\u001F\u007F]/.test(raw)) return null;
  // Backslash, by code point. Browsers read `/\evil.com` as a host,
  // exactly like `//evil.com`.
  if (raw.includes("\u005C")) return null;
  if (raw[0] !== "/") return null;
  if (raw[1] === "/") return null;
  return raw;
}
