import { Db, MongoClient } from 'mongodb';

import type { RuntimeConfig } from './config';

export interface MongoHealth {
  configured: boolean;
  connected: boolean;
  database: string;
  error?: string;
}

let client: MongoClient | null = null;
let db: Db | null = null;
let connectedUri: string | null = null;

export async function connectMongo(config: RuntimeConfig): Promise<Db> {
  if (!config.mongoUri) throw new Error('MONGODB_URI is required before connecting to MongoDB');
  if (db && connectedUri === config.mongoUri) return db;

  await closeMongo();
  const nextClient = new MongoClient(config.mongoUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    retryReads: true,
    retryWrites: true,
  });
  await nextClient.connect();
  await nextClient.db(config.mongoDbName).command({ ping: 1 });
  client = nextClient;
  db = nextClient.db(config.mongoDbName);
  connectedUri = config.mongoUri;
  return db;
}

export function getMongoDb(): Db {
  if (!db) throw new Error('MongoDB is not connected; call connectMongo() during startup');
  return db;
}

export async function getMongoHealth(config: RuntimeConfig): Promise<MongoHealth> {
  if (!config.mongoUri) {
    return { configured: false, connected: false, database: config.mongoDbName, error: 'MONGODB_URI is missing' };
  }
  if (!db || connectedUri !== config.mongoUri) {
    return { configured: true, connected: false, database: config.mongoDbName, error: 'MongoDB is not connected' };
  }
  try {
    await db.command({ ping: 1 });
    return { configured: true, connected: true, database: config.mongoDbName };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      database: config.mongoDbName,
      error: error instanceof Error ? error.message : 'MongoDB ping failed',
    };
  }
}

export async function closeMongo(): Promise<void> {
  if (client) await client.close();
  client = null;
  db = null;
  connectedUri = null;
}
