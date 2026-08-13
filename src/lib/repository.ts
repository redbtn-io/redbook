import "server-only";

import { ObjectId, type Collection, type Document, type Filter } from "mongodb";

import { connectMongo } from "@/lib/mongo";
import { requireOrgFilter, type OrgMembership } from "@/lib/authz";
import type { Principal } from "@/lib/session";
import type {
  BaseRecord,
  Client,
  ClientInput,
  Contact,
  ContactInput,
  Interaction,
  InteractionInput,
  Note,
  NoteInput,
} from "@/lib/crm";

/**
 * Persistence for the CRM.
 *
 * Every function takes a proven `OrgMembership` rather than a bare `orgId`.
 * That is deliberate: an `OrgMembership` can only be produced by
 * `resolveMemberships()` from a verified principal, so it is impossible to
 * call a repository function against a tenant the caller has not been proven
 * to belong to. The org filter is merged into every query and every write.
 *
 * Writes additionally take the `Principal` so `createdBy` records WHO acted,
 * separately from WHICH tenant owns the row.
 */

export function isValidObjectId(value: string): boolean {
  return ObjectId.isValid(value) && String(new ObjectId(value)) === value;
}

async function collection<T extends Document>(name: string): Promise<Collection<T>> {
  const db = await connectMongo();
  return db.collection<T>(name);
}

function nowIso(): string {
  return new Date().toISOString();
}

interface StoredBase {
  _id: ObjectId;
  orgId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

function toBase(doc: StoredBase) {
  return {
    id: String(doc._id),
    orgId: doc.orgId,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Scope a filter to the proven org. Callers cannot bypass this. */
function scoped<T extends Document>(membership: OrgMembership, extra: Filter<T> = {}): Filter<T> {
  return { ...requireOrgFilter(membership), ...extra } as Filter<T>;
}

// ---------------------------------------------------------------- clients

type StoredClient = StoredBase & Omit<Client, keyof BaseRecord>;

function toClient(doc: StoredClient): Client {
  return {
    ...toBase(doc),
    name: doc.name,
    industry: doc.industry,
    website: doc.website,
    status: doc.status,
    owner: doc.owner,
    arr: doc.arr,
    renewalDate: doc.renewalDate,
    tags: doc.tags ?? [],
    summary: doc.summary,
  };
}

export async function listClients(membership: OrgMembership): Promise<Client[]> {
  const clients = await collection<StoredClient>("clients");
  const docs = await clients.find(scoped(membership)).sort({ name: 1 }).limit(500).toArray();
  return docs.map(toClient);
}

export async function getClient(membership: OrgMembership, clientId: string): Promise<Client | null> {
  if (!isValidObjectId(clientId)) return null;
  const clients = await collection<StoredClient>("clients");
  const doc = await clients.findOne(scoped(membership, { _id: new ObjectId(clientId) }));
  return doc ? toClient(doc) : null;
}

export async function createClient(
  membership: OrgMembership,
  principal: Principal,
  input: ClientInput,
): Promise<Client> {
  const clients = await collection<StoredClient>("clients");
  const timestamp = nowIso();
  const doc = {
    orgId: membership.orgId,
    createdBy: principal.userId,
    createdAt: timestamp,
    updatedAt: timestamp,
    name: input.name,
    industry: input.industry,
    website: input.website,
    status: input.status,
    owner: input.owner,
    arr: input.arr,
    renewalDate: input.renewalDate,
    tags: input.tags ?? [],
    summary: input.summary,
  } as Omit<StoredClient, "_id">;
  const result = await clients.insertOne(doc as StoredClient);
  return toClient({ ...(doc as StoredClient), _id: result.insertedId });
}

export async function updateClient(
  membership: OrgMembership,
  clientId: string,
  patch: Partial<ClientInput>,
): Promise<Client | null> {
  if (!isValidObjectId(clientId)) return null;
  const clients = await collection<StoredClient>("clients");
  const doc = await clients.findOneAndUpdate(
    scoped(membership, { _id: new ObjectId(clientId) }),
    { $set: { ...patch, updatedAt: nowIso() } },
    { returnDocument: "after" },
  );
  return doc ? toClient(doc) : null;
}

/**
 * Deleting a client removes its whole record set. Doing this in one place
 * (rather than leaving contacts/notes/interactions behind) keeps the org from
 * accumulating orphans that would still match an org-scoped query.
 */
export async function deleteClient(membership: OrgMembership, clientId: string): Promise<boolean> {
  if (!isValidObjectId(clientId)) return false;
  const clients = await collection<StoredClient>("clients");
  const result = await clients.deleteOne(scoped(membership, { _id: new ObjectId(clientId) }));
  if (result.deletedCount === 0) return false;
  for (const name of ["contacts", "notes", "interactions"] as const) {
    const child = await collection(name);
    await child.deleteMany(scoped(membership, { clientId }) as Filter<Document>);
  }
  return true;
}

// --------------------------------------------------------------- contacts

type StoredContact = StoredBase & Omit<Contact, keyof BaseRecord>;

function toContact(doc: StoredContact): Contact {
  return {
    ...toBase(doc),
    clientId: doc.clientId,
    name: doc.name,
    title: doc.title,
    email: doc.email,
    phone: doc.phone,
    isPrimary: Boolean(doc.isPrimary),
    notes: doc.notes,
  };
}

export async function listContacts(membership: OrgMembership, clientId: string): Promise<Contact[]> {
  const contacts = await collection<StoredContact>("contacts");
  const docs = await contacts
    .find(scoped(membership, { clientId }))
    .sort({ isPrimary: -1, name: 1 })
    .limit(500)
    .toArray();
  return docs.map(toContact);
}

export async function createContact(
  membership: OrgMembership,
  principal: Principal,
  clientId: string,
  input: ContactInput,
): Promise<Contact> {
  const contacts = await collection<StoredContact>("contacts");
  const timestamp = nowIso();
  const doc = {
    orgId: membership.orgId,
    createdBy: principal.userId,
    createdAt: timestamp,
    updatedAt: timestamp,
    clientId,
    name: input.name,
    title: input.title,
    email: input.email,
    phone: input.phone,
    isPrimary: Boolean(input.isPrimary),
    notes: input.notes,
  } as Omit<StoredContact, "_id">;
  const result = await contacts.insertOne(doc as StoredContact);
  return toContact({ ...(doc as StoredContact), _id: result.insertedId });
}

export async function updateContact(
  membership: OrgMembership,
  contactId: string,
  patch: Partial<ContactInput>,
): Promise<Contact | null> {
  if (!isValidObjectId(contactId)) return null;
  const contacts = await collection<StoredContact>("contacts");
  const doc = await contacts.findOneAndUpdate(
    scoped(membership, { _id: new ObjectId(contactId) }),
    { $set: { ...patch, updatedAt: nowIso() } },
    { returnDocument: "after" },
  );
  return doc ? toContact(doc) : null;
}

export async function deleteContact(membership: OrgMembership, contactId: string): Promise<boolean> {
  if (!isValidObjectId(contactId)) return false;
  const contacts = await collection<StoredContact>("contacts");
  const result = await contacts.deleteOne(scoped(membership, { _id: new ObjectId(contactId) }));
  return result.deletedCount > 0;
}

// ------------------------------------------------------------------ notes

type StoredNote = StoredBase & Omit<Note, keyof BaseRecord>;

function toNote(doc: StoredNote): Note {
  return {
    ...toBase(doc),
    clientId: doc.clientId,
    body: doc.body,
    pinned: Boolean(doc.pinned),
  };
}

export async function listNotes(membership: OrgMembership, clientId: string): Promise<Note[]> {
  const notes = await collection<StoredNote>("notes");
  const docs = await notes
    .find(scoped(membership, { clientId }))
    .sort({ pinned: -1, createdAt: -1 })
    .limit(500)
    .toArray();
  return docs.map(toNote);
}

export async function createNote(
  membership: OrgMembership,
  principal: Principal,
  clientId: string,
  input: NoteInput,
): Promise<Note> {
  const notes = await collection<StoredNote>("notes");
  const timestamp = nowIso();
  const doc = {
    orgId: membership.orgId,
    createdBy: principal.userId,
    createdAt: timestamp,
    updatedAt: timestamp,
    clientId,
    body: input.body,
    pinned: Boolean(input.pinned),
  } as Omit<StoredNote, "_id">;
  const result = await notes.insertOne(doc as StoredNote);
  return toNote({ ...(doc as StoredNote), _id: result.insertedId });
}

export async function updateNote(
  membership: OrgMembership,
  noteId: string,
  patch: Partial<NoteInput>,
): Promise<Note | null> {
  if (!isValidObjectId(noteId)) return null;
  const notes = await collection<StoredNote>("notes");
  const doc = await notes.findOneAndUpdate(
    scoped(membership, { _id: new ObjectId(noteId) }),
    { $set: { ...patch, updatedAt: nowIso() } },
    { returnDocument: "after" },
  );
  return doc ? toNote(doc) : null;
}

export async function deleteNote(membership: OrgMembership, noteId: string): Promise<boolean> {
  if (!isValidObjectId(noteId)) return false;
  const notes = await collection<StoredNote>("notes");
  const result = await notes.deleteOne(scoped(membership, { _id: new ObjectId(noteId) }));
  return result.deletedCount > 0;
}

// ----------------------------------------------------------- interactions

type StoredInteraction = StoredBase & Omit<Interaction, keyof BaseRecord>;

function toInteraction(doc: StoredInteraction): Interaction {
  return {
    ...toBase(doc),
    clientId: doc.clientId,
    type: doc.type,
    subject: doc.subject,
    occurredAt: doc.occurredAt,
    participants: doc.participants ?? [],
    summary: doc.summary,
    transcript: doc.transcript,
    followUps: doc.followUps ?? [],
  };
}

export async function listInteractions(
  membership: OrgMembership,
  clientId: string,
): Promise<Interaction[]> {
  const interactions = await collection<StoredInteraction>("interactions");
  const docs = await interactions
    .find(scoped(membership, { clientId }))
    .sort({ occurredAt: -1 })
    .limit(500)
    .toArray();
  return docs.map(toInteraction);
}

export async function createInteraction(
  membership: OrgMembership,
  principal: Principal,
  clientId: string,
  input: InteractionInput,
): Promise<Interaction> {
  const interactions = await collection<StoredInteraction>("interactions");
  const timestamp = nowIso();
  const doc = {
    orgId: membership.orgId,
    createdBy: principal.userId,
    createdAt: timestamp,
    updatedAt: timestamp,
    clientId,
    type: input.type,
    subject: input.subject,
    occurredAt: input.occurredAt,
    participants: input.participants ?? [],
    summary: input.summary,
    transcript: input.transcript,
    followUps: input.followUps ?? [],
  } as Omit<StoredInteraction, "_id">;
  const result = await interactions.insertOne(doc as StoredInteraction);
  return toInteraction({ ...(doc as StoredInteraction), _id: result.insertedId });
}

export async function updateInteraction(
  membership: OrgMembership,
  interactionId: string,
  patch: Partial<InteractionInput>,
): Promise<Interaction | null> {
  if (!isValidObjectId(interactionId)) return null;
  const interactions = await collection<StoredInteraction>("interactions");
  const doc = await interactions.findOneAndUpdate(
    scoped(membership, { _id: new ObjectId(interactionId) }),
    { $set: { ...patch, updatedAt: nowIso() } },
    { returnDocument: "after" },
  );
  return doc ? toInteraction(doc) : null;
}

export async function deleteInteraction(
  membership: OrgMembership,
  interactionId: string,
): Promise<boolean> {
  if (!isValidObjectId(interactionId)) return false;
  const interactions = await collection<StoredInteraction>("interactions");
  const result = await interactions.deleteOne(scoped(membership, { _id: new ObjectId(interactionId) }));
  return result.deletedCount > 0;
}

// ------------------------------------------------------------------ stats

export interface ClientSummary {
  clientId: string;
  contactCount: number;
  noteCount: number;
  interactionCount: number;
  lastInteractionAt?: string;
}

/**
 * Roll-ups for the client list, computed in one aggregation per collection
 * rather than N queries per client.
 */
export async function summarizeClients(membership: OrgMembership): Promise<Map<string, ClientSummary>> {
  const [contacts, notes, interactions] = await Promise.all([
    collection("contacts"),
    collection("notes"),
    collection("interactions"),
  ]);
  const filter = scoped(membership) as Filter<Document>;

  const [contactCounts, noteCounts, interactionStats] = await Promise.all([
    contacts.aggregate([{ $match: filter }, { $group: { _id: "$clientId", n: { $sum: 1 } } }]).toArray(),
    notes.aggregate([{ $match: filter }, { $group: { _id: "$clientId", n: { $sum: 1 } } }]).toArray(),
    interactions
      .aggregate([
        { $match: filter },
        { $group: { _id: "$clientId", n: { $sum: 1 }, last: { $max: "$occurredAt" } } },
      ])
      .toArray(),
  ]);

  const summaries = new Map<string, ClientSummary>();
  const ensure = (clientId: string): ClientSummary => {
    let entry = summaries.get(clientId);
    if (!entry) {
      entry = { clientId, contactCount: 0, noteCount: 0, interactionCount: 0 };
      summaries.set(clientId, entry);
    }
    return entry;
  };

  for (const row of contactCounts) ensure(String(row._id)).contactCount = row.n as number;
  for (const row of noteCounts) ensure(String(row._id)).noteCount = row.n as number;
  for (const row of interactionStats) {
    const entry = ensure(String(row._id));
    entry.interactionCount = row.n as number;
    entry.lastInteractionAt = (row.last as string) || undefined;
  }
  return summaries;
}

export async function countClients(membership: OrgMembership): Promise<number> {
  const clients = await collection("clients");
  return clients.countDocuments(scoped(membership) as Filter<Document>);
}
