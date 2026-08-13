import "server-only";

import { getConfig, validateRuntimeConfig } from "@/lib/config";
import { getMongoHealth } from "@/lib/mongo";
import { resolveJwtSecret } from "@/lib/secrets";

/**
 * The health report behind both /healthz and /ready.
 *
 * Unauthenticated by design — RedRun, Traefik, and the container HEALTHCHECK
 * all call it with no session — so it reports booleans and a database NAME
 * only: never a URI, a secret, or a driver error string that would carry
 * either. It reports unhealthy unless Mongo is reachable AND a signing secret
 * resolved, which is exactly the condition under which this container should
 * not be taking traffic.
 */
export async function healthResponse(): Promise<Response> {
  const config = getConfig();
  const [mongo, jwtSecret] = await Promise.all([
    getMongoHealth(config).catch(() => ({
      configured: Boolean(config.mongoUri),
      connected: false,
      database: config.mongoDbName,
    })),
    resolveJwtSecret(config).catch(() => null),
  ]);

  const configErrors = validateRuntimeConfig(config);
  const healthy = configErrors.length === 0 && mongo.connected && Boolean(jwtSecret);

  return new Response(
    JSON.stringify({
      status: healthy ? "healthy" : "unhealthy",
      service: config.serviceName,
      channel: config.channel,
      uptimeSeconds: Math.round(process.uptime()),
      config: { valid: configErrors.length === 0, errors: configErrors },
      auth: { configured: Boolean(jwtSecret), cookieName: config.cookieName },
      mongo: { configured: mongo.configured, connected: mongo.connected, database: mongo.database },
    }),
    {
      status: healthy ? 200 : 503,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    },
  );
}
