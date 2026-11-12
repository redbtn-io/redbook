import "server-only";

import { MongoClient, ObjectId, type Collection, type Document } from "mongodb";

import { getConfig, type RuntimeConfig } from "@/lib/config";
import { logWarn } from "@/lib/logging";

/**
 * Read-only lookups against the SHARED ecosystem `redauth` directory.
 *
 * redOrg stores memberships by `userId` and knows nothing about people, so
 * seeding "these humans are members" needs email → userId resolution. That
 * mapping lives in redauth.
 *
 * This module is deliberately read-only. redBook does not create ecosystem
 * identities: `findOrCreateUser` against the shared directory would mint a
 * real, fleet-wide user record as a side effect of seeding placeholder data,
 * which is not redBook's call to make. An email with no user yet becomes a
 * pending member instead (see `redorg.ts`), and resolves itself the first
 * time that person actually signs in through accounts.redbtn.io.
 */

const globalForDirectory = globalThis as unknown as {
  __redbookDirectory?: { client: MongoClient; uri: string };
};

async function usersCollection(config: RuntimeConfig): Promise<Collection<Document> | null> {
  const uri = config.authMongoUri;
  if (!uri) return null;

  const existing = globalForDirectory.__redbookDirectory;
  if (existing && existing.uri === uri) {
    return existing.client.db(config.authMongoDbName).collection("users");
  }
  if (existing) await existing.client.close().catch(() => undefined);

  const client = new MongoClient(uri, {
    maxPoolSize: 3,
    serverSelectionTimeoutMS: 8_000,
    connectTimeoutMS: 8_000,
  });
  await client.connect();
  globalForDirectory.__redbookDirectory = { client, uri };
  return client.db(config.authMongoDbName).collection("users");
}

/**
 * Resolve emails to ecosystem userIds. Unknown emails are simply absent from
 * the returned map — never invented.
 */
export async function resolveUserIdsByEmail(
  emails: readonly string[],
  config: RuntimeConfig = getConfig(),
): Promise<Map<string, string>> {
  const wanted = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  const resolved = new Map<string, string>();
  if (wanted.length === 0) return resolved;

  try {
    const users = await usersCollection(config);
    if (!users) return resolved;
    const docs = await users
      .find({ email: { $in: wanted } }, { projection: { _id: 1, email: 1 } })
      .toArray();
    for (const doc of docs) {
      if (typeof doc.email === "string") resolved.set(doc.email.toLowerCase(), String(doc._id));
    }
  } catch (error) {
    // A directory outage must not stop the app serving an already-seeded org.
    logWarn("redauth directory lookup failed", {
      error: error instanceof Error ? error.message : "unknown error",
    });
  }
  return resolved;
}

export interface DirectoryPerson {
  email: string;
  name?: string;
}

/**
 * Resolve ecosystem userIds back to people, for the members surface. redOrg
 * stores only userIds; the email and display name live here in redauth.
 * Unknown ids are simply absent from the returned map, never invented.
 */
export async function resolvePeopleByUserId(
  userIds: readonly string[],
  config: RuntimeConfig = getConfig(),
): Promise<Map<string, DirectoryPerson>> {
  const wanted = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  const resolved = new Map<string, DirectoryPerson>();
  if (wanted.length === 0) return resolved;

  try {
    const users = await usersCollection(config);
    if (!users) return resolved;
    // redauth keys users by ObjectId; ask for both shapes so a string-keyed
    // record (older or service-created) still resolves.
    const objectIds = wanted
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));
    const docs = await users
      .find(
        { _id: { $in: [...objectIds, ...wanted] as never[] } },
        { projection: { _id: 1, email: 1, name: 1 } },
      )
      .toArray();
    for (const doc of docs) {
      if (typeof doc.email !== "string") continue;
      resolved.set(String(doc._id), {
        email: doc.email.toLowerCase(),
        name: typeof doc.name === "string" && doc.name.trim() ? doc.name : undefined,
      });
    }
  } catch (error) {
    logWarn("redauth people lookup failed", {
      error: error instanceof Error ? error.message : "unknown error",
    });
  }
  return resolved;
}

export async function closeDirectory(): Promise<void> {
  const existing = globalForDirectory.__redbookDirectory;
  if (existing) await existing.client.close().catch(() => undefined);
  globalForDirectory.__redbookDirectory = undefined;
}
