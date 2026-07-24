export type DeploymentChannel = 'beta' | 'production';

export interface RuntimeConfig {
  serviceName: 'redbook-functions';
  channel: DeploymentChannel;
  port: number;
  publicUrl: string;
  mongoUri: string;
  mongoDbName: string;
  authMongoUri: string;
  authMongoDbName: string;
  secretsDatabase: string;
  /** Bootstrap-only key used to decrypt values held by redsecrets. */
  secretsEncryptionKey?: string;
  /** Only populated by tests or an explicitly injected bootstrap secret. */
  jwtSecret?: string;
  cookieName: 'red_session';
  production: boolean;
}

export interface PublicRuntimeConfig {
  serviceName: RuntimeConfig['serviceName'];
  channel: RuntimeConfig['channel'];
  port: number;
  publicUrl: string;
  mongoDbName: string;
  authMongoDbName: string;
  auth: { provider: '@redbtn/red auth'; cookieName: 'red_session'; configured: boolean };
}

const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27017/redbook';

function readPort(value: string | undefined): number {
  const port = Number.parseInt(value || '3000', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535; received ${JSON.stringify(value)}`);
  }
  return port;
}

function readChannel(value: string | undefined): DeploymentChannel {
  return value === 'production' ? 'production' : 'beta';
}

function databaseNameFromUri(uri: string, fallback: string): string {
  try {
    const pathname = new URL(uri).pathname.replace(/^\//, '');
    return pathname || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Load non-secret runtime settings. Connection URIs are deployment config;
 * application credentials are intentionally resolved through redsecrets.
 */
export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const channel = readChannel(env.REDRUN_CHANNEL || env.DEPLOYMENT_CHANNEL);
  const production = env.NODE_ENV === 'production' || channel === 'production';
  const mongoUri = env.MONGODB_URI || (production ? '' : DEFAULT_MONGO_URI);
  const authMongoUri = env.AUTH_MONGODB_URI || mongoUri;

  return {
    serviceName: 'redbook-functions',
    channel,
    port: readPort(env.PORT),
    publicUrl: (env.PUBLIC_URL || env.REDBOOK_PUBLIC_URL || `http://127.0.0.1:${env.PORT || '3000'}`).replace(/\/$/, ''),
    mongoUri,
    mongoDbName: env.MONGODB_DB || databaseNameFromUri(mongoUri, 'redbook'),
    authMongoUri,
    authMongoDbName: env.AUTH_MONGODB_DB || databaseNameFromUri(authMongoUri, 'redauth'),
    secretsDatabase: env.REDSECRETS_DATABASE || 'redshared',
    secretsEncryptionKey: env.REDBOOK_SECRETS_ENCRYPTION_KEY,
    // A test-only injection keeps auth tests hermetic. Production startup uses
    // loadRuntimeSecrets() below and never takes JWT_SECRET from process.env.
    jwtSecret: env.NODE_ENV === 'test' ? env.JWT_SECRET : undefined,
    cookieName: 'red_session',
    production,
  };
}

export function validateRuntimeConfig(config: RuntimeConfig): string[] {
  const errors: string[] = [];
  if (!config.mongoUri) errors.push('MONGODB_URI is required in production');
  if (!config.secretsEncryptionKey) errors.push('REDBOOK_SECRETS_ENCRYPTION_KEY is required');
  return errors;
}

export function toPublicRuntimeConfig(config: RuntimeConfig, authConfigured = Boolean(config.jwtSecret)): PublicRuntimeConfig {
  return {
    serviceName: config.serviceName,
    channel: config.channel,
    port: config.port,
    publicUrl: config.publicUrl,
    mongoDbName: config.mongoDbName,
    authMongoDbName: config.authMongoDbName,
    auth: { provider: '@redbtn/red auth', cookieName: config.cookieName, configured: authConfigured },
  };
}
