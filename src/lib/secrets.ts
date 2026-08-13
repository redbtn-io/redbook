import "server-only";

import { SecretsClient } from "@redbtn/redsecrets";

import { getConfig, normalizeSecret, type RuntimeConfig } from "@/lib/config";
import { connectMongo } from "@/lib/mongo";
import { logWarn } from "@/lib/logging";

/**
 * Resolve the shared session secret.
 *
 * Two paths, in order:
 *  1. `JWT_SECRET` from the RedRun workspace `appConfig.env`. This is the
 *     normal path — RedRun's redsecrets integration is BUILD-time only, so
 *     runtime credentials live in `appConfig.env`, exactly as
 *     accounts.redbtn.io itself is configured.
 *  2. The encrypted redsecrets store, if `REDBOOK_SECRETS_ENCRYPTION_KEY` is
 *     set. Retained from the original functions service so an operator can
 *     move the secret out of plain workspace env without a code change.
 *
 * Either way the value is run through `normalizeSecret`, because a secret
 * that arrives wrapped in quotes verifies nothing and reports itself as a
 * signature mismatch.
 */
let cached: string | null | undefined;

export async function resolveJwtSecret(config: RuntimeConfig = getConfig()): Promise<string | null> {
  if (cached !== undefined) return cached;

  if (config.jwtSecret) {
    cached = config.jwtSecret;
    return cached;
  }

  if (!config.secretsEncryptionKey) {
    cached = null;
    return cached;
  }

  try {
    const db = await connectMongo(config);
    const secrets = new SecretsClient(db, {
      database: config.secretsDatabase,
      encryptionKey: config.secretsEncryptionKey,
    });
    await secrets.ensureIndexes();
    const values = await secrets.resolve({
      appName: "redbook",
      scope: "global",
      names: ["JWT_SECRET"],
    });
    cached = normalizeSecret(values.JWT_SECRET) ?? null;
  } catch (error) {
    logWarn("redsecrets lookup for JWT_SECRET failed", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    cached = null;
  }
  return cached;
}

/** Test seam. */
export function resetSecretsCache(): void {
  cached = undefined;
}
