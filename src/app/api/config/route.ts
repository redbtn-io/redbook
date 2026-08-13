import { getConfig, toPublicRuntimeConfig } from "@/lib/config";
import { resolveJwtSecret } from "@/lib/secrets";
import { json } from "@/lib/api";

/**
 * Non-secret runtime facts a client may need (which accounts host to sign in
 * against, which channel this is). `toPublicRuntimeConfig` is the allow-list:
 * connection URIs and secrets are never part of its return type, so this
 * cannot start leaking them by accident later.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const config = getConfig();
  const jwtSecret = await resolveJwtSecret(config).catch(() => null);
  return json(toPublicRuntimeConfig(config, Boolean(jwtSecret)));
}
