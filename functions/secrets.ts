import { SecretsClient } from '@redbtn/redsecrets';
import type { Db } from 'mongodb';

import type { RuntimeConfig } from './config';

export interface RuntimeSecrets {
  jwtSecret: string;
  emailUser?: string;
  emailPass?: string;
}

/**
 * Resolve application credentials from the shared encrypted store. The only
 * bootstrap secret accepted from RedRun config is the encryption key needed to
 * read that store; JWT and Gmail credentials never fall back to process.env.
 */
export async function loadRuntimeSecrets(db: Db, config: RuntimeConfig): Promise<RuntimeSecrets> {
  if (!config.secretsEncryptionKey) {
    throw new Error('REDBOOK_SECRETS_ENCRYPTION_KEY is required to resolve redsecrets');
  }

  const secrets = new SecretsClient(db, {
    database: config.secretsDatabase,
    encryptionKey: config.secretsEncryptionKey,
  });
  await secrets.ensureIndexes();
  const values = await secrets.resolve({
    appName: 'redbook',
    scope: 'global',
    names: ['JWT_SECRET', 'EMAIL_USER', 'EMAIL_PASS'],
  });

  if (!values.JWT_SECRET) throw new Error('redsecrets is missing the required redbook JWT_SECRET');
  return { jwtSecret: values.JWT_SECRET, emailUser: values.EMAIL_USER, emailPass: values.EMAIL_PASS };
}
