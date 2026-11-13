import { errorResponse, json, readJsonBody, withOrg } from "@/lib/api";
import { canDeleteClient } from "@/lib/authz";
import { validateClient } from "@/lib/crm";
import { logInfo } from "@/lib/logging";
import { getOrgPermissions } from "@/lib/redorg";
import {
  deleteClient,
  getClient,
  listContacts,
  listInteractions,
  listNotes,
  updateClient,
} from "@/lib/repository";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ clientId: string }> };

/**
 * The whole client record in one round trip. A 404 here is indistinguishable
 * from "exists but belongs to someone else" — the repository's owner filter
 * makes both cases return null, which is what stops this endpoint being an
 * existence oracle for other users' clients.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { clientId } = await params;
  return withOrg(request, async ({ membership, principal }) => {
    const client = await getClient(membership, clientId);
    if (!client) return errorResponse(404, "Not Found");
    const [contacts, notes, interactions] = await Promise.all([
      listContacts(membership, clientId),
      listNotes(membership, clientId),
      listInteractions(membership, clientId),
    ]);
    return json({ client, contacts, notes, interactions });
  });
}

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { clientId } = await params;
  return withOrg(request, async ({ membership, principal }) => {
    const body = await readJsonBody(request);
    if (!body.ok) return errorResponse(400, body.error);
    const validated = validateClient(body.value, { partial: true });
    if (!validated.ok) return errorResponse(400, validated.error);
    const client = await updateClient(membership, clientId, validated.value);
    if (!client) return errorResponse(404, "Not Found");
    return json({ client });
  });
}

/**
 * Deleting a client cascades to its contacts, notes, and interactions, so
 * unlike the child record deletes it is gated: owner and admin roles only
 * (`canDeleteClient`), refused here on the API as well as hidden in the UI,
 * because a hidden button is not a permission.
 *
 * The deletion is recorded with who did it (audit story 2.2.2). The
 * directory audit log's action vocabulary is a closed enum of org, member,
 * role, and invite actions with no client entry, so the record goes to
 * redBook's own log stream through `logInfo`, the same mechanism the seat
 * actions in `redorg.ts` record themselves with, carrying the actor, the
 * client, and the cascade counts captured before the delete.
 */
export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const { clientId } = await params;
  return withOrg(request, async ({ membership, principal }) => {
    const permissions = await getOrgPermissions(membership.orgId, principal.userId);
    if (!canDeleteClient(membership, permissions)) {
      return errorResponse(403, "Only an org owner or admin can delete a client");
    }
    const client = await getClient(membership, clientId);
    if (!client) return errorResponse(404, "Not Found");
    const [contacts, notes, interactions] = await Promise.all([
      listContacts(membership, clientId),
      listNotes(membership, clientId),
      listInteractions(membership, clientId),
    ]);
    const removed = await deleteClient(membership, clientId);
    if (!removed) return errorResponse(404, "Not Found");
    logInfo("Client deleted", {
      orgId: membership.orgId,
      clientId: client.id,
      clientName: client.name,
      deletedBy: principal.userId,
      actorEmail: principal.email,
      contacts: contacts.length,
      notes: notes.length,
      interactions: interactions.length,
    });
    return json({ deleted: true });
  });
}
