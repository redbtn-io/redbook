/**
 * Non-secret runtime settings for redBook.
 *
 * Connection URIs and public URLs are deployment config and come from the
 * RedRun workspace `appConfig.env` (RUNTIME env; redsecrets is BUILD-time
 * only in RedRun, so runtime credentials must live here). `JWT_SECRET` is
 * the one credential read from env: it is the SHARED ecosystem secret that
 * accounts.redbtn.io signs `red_session` with, so redBook can only verify —
 * never mint — sessions with it.
 */

export type DeploymentChannel = "beta" | "production";

export interface RuntimeConfig {
  serviceName: "redbook";
  channel: DeploymentChannel;
  port: number;
  publicUrl: string;
  /** Central sign-in origin that owns the shared session. */
  accountsUrl: string;
  /**
   * The ecosystem billing service. redBook reads the SIGNED-IN USER's own
   * redbtn subscription and invoices from it server-to-server, forwarding
   * only that caller's `red_session` cookie — see `src/lib/billing.ts`.
   */
  billingUrl: string;
  mongoUri: string;
  mongoDbName: string;
  /** Shared ecosystem redauth DB — read-only, for email -> userId lookups. */
  authMongoUri: string;
  authMongoDbName: string;
  secretsDatabase: string;
  /** Optional bootstrap key enabling the redsecrets fallback for JWT_SECRET. */
  secretsEncryptionKey?: string;
  jwtSecret?: string;
  /** Enables the X-User-Id + X-Internal-Key service transport when set. */
  internalServiceKey?: string;
  cookieName: "red_session";
  /** Name/slug of the shared org bootstrapped on first use. */
  defaultOrgName: string;
  defaultOrgSlug: string;
  /**
   * Humans seated in that org. An email with no ecosystem identity yet becomes
   * a pending member and is claimed on first sign-in, so the Josh placeholder
   * is a one-line change here.
   */
  orgMemberEmails: string[];
  /** Seed a new org's empty book with starter data on first load. */
  autoSeed: boolean;
  production: boolean;
}

const DEFAULT_MONGO_URI = "mongodb://127.0.0.1:27017/redbook";

/**
 * A secret stored with surrounding quotes is a recurring fleet foot-gun: the
 * value round-trips through shell/JSON config and arrives as `"abc"` rather
 * than `abc`, so every HS256 verification fails with a signature error that
 * looks like a key mismatch. Strip one matched pair of wrapping quotes.
 */
export function normalizeSecret(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1).trim()
      : trimmed;
  return unquoted || undefined;
}

/** Comma-separated emails, lowercased and de-duplicated. */
function readEmailList(value: string | undefined): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.includes("@")),
    ),
  ];
}

function readPort(value: string | undefined): number {
  const port = Number.parseInt(value || "3000", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535; received ${JSON.stringify(value)}`);
  }
  return port;
}

function readChannel(value: string | undefined): DeploymentChannel {
  return value === "production" ? "production" : "beta";
}

function databaseNameFromUri(uri: string, fallback: string): string {
  try {
    const pathname = new URL(uri).pathname.replace(/^\//, "");
    return pathname || fallback;
  } catch {
    return fallback;
  }
}

export type EnvBag = Record<string, string | undefined>;

export function loadRuntimeConfig(env: EnvBag = process.env): RuntimeConfig {
  const channel = readChannel(env.REDRUN_CHANNEL || env.DEPLOYMENT_CHANNEL);
  const production = env.NODE_ENV === "production" || channel === "production";
  const mongoUri = env.MONGODB_URI || (production ? "" : DEFAULT_MONGO_URI);
  const authMongoUri = env.AUTH_MONGODB_URI || mongoUri;

  return {
    serviceName: "redbook",
    channel,
    port: readPort(env.PORT),
    publicUrl: (env.PUBLIC_URL || env.BASE_URL || `http://127.0.0.1:${env.PORT || "3000"}`).replace(/\/$/, ""),
    accountsUrl: (env.ACCOUNTS_URL || "https://accounts.redbtn.io").replace(/\/$/, ""),
    billingUrl: (env.BILLING_URL || "https://billing.redbtn.io").replace(/\/$/, ""),
    mongoUri,
    mongoDbName: env.MONGODB_DB || databaseNameFromUri(mongoUri, "redbook"),
    authMongoUri,
    // Only derive the directory DB name from the URI path when a dedicated
    // AUTH_MONGODB_URI was supplied. Falling back to MONGODB_URI's path would
    // silently point the user lookup at redBook's OWN database (which has no
    // users collection), so the default stays the ecosystem `redauth`.
    authMongoDbName:
      env.AUTH_MONGODB_DB ||
      (env.AUTH_MONGODB_URI ? databaseNameFromUri(env.AUTH_MONGODB_URI, "redauth") : "redauth"),
    secretsDatabase: env.REDSECRETS_DATABASE || "redshared",
    secretsEncryptionKey: normalizeSecret(env.REDBOOK_SECRETS_ENCRYPTION_KEY),
    jwtSecret: normalizeSecret(env.JWT_SECRET),
    internalServiceKey: normalizeSecret(env.INTERNAL_SERVICE_KEY),
    cookieName: "red_session",
    defaultOrgName: env.REDBOOK_DEFAULT_ORG_NAME || "FinThrive",
    defaultOrgSlug: env.REDBOOK_DEFAULT_ORG_SLUG || "finthrive",
    orgMemberEmails: readEmailList(
      env.REDBOOK_ORG_MEMBER_EMAILS ?? "george8794@gmail.com,josh@finthrive.example",
    ),
    autoSeed: env.REDBOOK_AUTOSEED !== "false",
    production,
  };
}

export function validateRuntimeConfig(config: RuntimeConfig): string[] {
  const errors: string[] = [];
  if (!config.mongoUri) errors.push("MONGODB_URI is required");
  if (!config.jwtSecret && !config.secretsEncryptionKey) {
    errors.push("JWT_SECRET (or REDBOOK_SECRETS_ENCRYPTION_KEY for the redsecrets fallback) is required");
  }
  return errors;
}

export interface PublicRuntimeConfig {
  serviceName: RuntimeConfig["serviceName"];
  channel: RuntimeConfig["channel"];
  publicUrl: string;
  accountsUrl: string;
  mongoDbName: string;
  auth: { provider: "@redbtn/redauth"; cookieName: "red_session"; configured: boolean };
}

export function toPublicRuntimeConfig(config: RuntimeConfig, authConfigured: boolean): PublicRuntimeConfig {
  return {
    serviceName: config.serviceName,
    channel: config.channel,
    publicUrl: config.publicUrl,
    accountsUrl: config.accountsUrl,
    mongoDbName: config.mongoDbName,
    auth: { provider: "@redbtn/redauth", cookieName: config.cookieName, configured: authConfigured },
  };
}

/**
 * Central sign-in URL for an unauthenticated visitor.
 *
 * The contract accounts.redbtn.io actually implements is `/?next=<absolute
 * https url>` on the ROOT path — `app/page.tsx` reads `params.get('next')`,
 * and `lib/returnTo.ts` `safeReturnTo()` then requires the value be https and
 * first-party (`redbtn.io` or a dot-anchored subdomain). A non-https or
 * off-domain value is silently replaced with `https://redbtn.io/`, so
 * `publicUrl` MUST be the real `https://book.redbtn.io` in production or the
 * bounce-back lands on the wrong site.
 */
export function signInUrl(config: RuntimeConfig, returnPath = "/"): string {
  const next = new URL(returnPath, `${config.publicUrl}/`).toString();
  return `${config.accountsUrl}/?next=${encodeURIComponent(next)}`;
}

let cached: RuntimeConfig | null = null;

/** Lazily resolved singleton so a Docker build with no env still compiles. */
export function getConfig(): RuntimeConfig {
  if (!cached) cached = loadRuntimeConfig();
  return cached;
}

/** Test seam. */
export function resetConfigCache(): void {
  cached = null;
}
