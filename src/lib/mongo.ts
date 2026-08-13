import "server-only";

import { Db, MongoClient } from "mongodb";

import { getConfig, type RuntimeConfig } from "@/lib/config";

export interface MongoHealth {
  configured: boolean;
  connected: boolean;
  database: string;
  error?: string;
}

/**
 * Next dev/HMR re-evaluates modules, and a plain module-level singleton leaks
 * a new pool on every reload until Mongo refuses connections. Park the client
 * on globalThis so a reload reuses it.
 */
const globalForMongo = globalThis as unknown as {
  __redbookMongo?: { client: MongoClient; db: Db; uri: string; dbName: string };
};

export async function connectMongo(config: RuntimeConfig = getConfig()): Promise<Db> {
  if (!config.mongoUri) throw new Error("MONGODB_URI is required before connecting to MongoDB");

  const existing = globalForMongo.__redbookMongo;
  if (existing && existing.uri === config.mongoUri && existing.dbName === config.mongoDbName) {
    return existing.db;
  }
  if (existing) await existing.client.close().catch(() => undefined);

  const client = new MongoClient(config.mongoUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    retryReads: true,
    retryWrites: true,
  });
  await client.connect();
  const db = client.db(config.mongoDbName);
  await db.command({ ping: 1 });

  globalForMongo.__redbookMongo = { client, db, uri: config.mongoUri, dbName: config.mongoDbName };
  await ensureIndexes(db);
  return db;
}

let indexesEnsured = false;

/**
 * Every CRM collection is queried org-first, so every index leads with
 * `orgId`. That is also the structural half of tenant isolation: a query that
 * forgets the org filter cannot ride an index and shows up in profiling.
 */
async function ensureIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  indexesEnsured = true;
  try {
    await Promise.all([
      db.collection("clients").createIndex({ orgId: 1, name: 1 }),
      db.collection("clients").createIndex({ orgId: 1, updatedAt: -1 }),
      db.collection("contacts").createIndex({ orgId: 1, clientId: 1 }),
      db.collection("notes").createIndex({ orgId: 1, clientId: 1, createdAt: -1 }),
      db.collection("interactions").createIndex({ orgId: 1, clientId: 1, occurredAt: -1 }),
      db.collection("org_pending_members").createIndex({ email: 1 }),
    ]);
  } catch {
    // A read-only or already-indexed database must not stop the app booting.
    indexesEnsured = false;
  }
}

export async function getMongoHealth(config: RuntimeConfig = getConfig()): Promise<MongoHealth> {
  if (!config.mongoUri) {
    return { configured: false, connected: false, database: config.mongoDbName, error: "MONGODB_URI is missing" };
  }
  try {
    const db = await connectMongo(config);
    await db.command({ ping: 1 });
    return { configured: true, connected: true, database: config.mongoDbName };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      database: config.mongoDbName,
      error: error instanceof Error ? error.message : "MongoDB ping failed",
    };
  }
}

export async function closeMongo(): Promise<void> {
  const existing = globalForMongo.__redbookMongo;
  if (existing) await existing.client.close().catch(() => undefined);
  globalForMongo.__redbookMongo = undefined;
  indexesEnsured = false;
}
