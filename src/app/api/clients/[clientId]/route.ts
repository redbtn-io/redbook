import { errorResponse, json, readJsonBody, withPrincipal } from "@/lib/api";
import { validateClient } from "@/lib/crm";
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
  return withPrincipal(request, async (principal) => {
    const client = await getClient(principal, clientId);
    if (!client) return errorResponse(404, "Not Found");
    const [contacts, notes, interactions] = await Promise.all([
      listContacts(principal, clientId),
      listNotes(principal, clientId),
      listInteractions(principal, clientId),
    ]);
    return json({ client, contacts, notes, interactions });
  });
}

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { clientId } = await params;
  return withPrincipal(request, async (principal) => {
    const body = await readJsonBody(request);
    if (!body.ok) return errorResponse(400, body.error);
    const validated = validateClient(body.value, { partial: true });
    if (!validated.ok) return errorResponse(400, validated.error);
    const client = await updateClient(principal, clientId, validated.value);
    if (!client) return errorResponse(404, "Not Found");
    return json({ client });
  });
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const { clientId } = await params;
  return withPrincipal(request, async (principal) => {
    const removed = await deleteClient(principal, clientId);
    if (!removed) return errorResponse(404, "Not Found");
    return json({ deleted: true });
  });
}
