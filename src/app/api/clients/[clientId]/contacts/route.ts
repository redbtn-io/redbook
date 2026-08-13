import { errorResponse, json, readJsonBody, withOrg } from "@/lib/api";
import { validateContact, type ContactInput } from "@/lib/crm";
import { createContact, getClient, listContacts } from "@/lib/repository";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ clientId: string }> };

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { clientId } = await params;
  return withOrg(request, async ({ membership, principal }) => {
    // Confirm the parent belongs to this caller before listing children, so a
    // guessed clientId cannot enumerate another user's contacts.
    if (!(await getClient(membership, clientId))) return errorResponse(404, "Not Found");
    return json({ contacts: await listContacts(membership, clientId) });
  });
}

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { clientId } = await params;
  return withOrg(request, async ({ membership, principal }) => {
    if (!(await getClient(membership, clientId))) return errorResponse(404, "Not Found");
    const body = await readJsonBody(request);
    if (!body.ok) return errorResponse(400, body.error);
    const validated = validateContact(body.value);
    if (!validated.ok) return errorResponse(400, validated.error);
    const contact = await createContact(membership, principal, clientId, validated.value as ContactInput);
    return json({ contact }, 201);
  });
}
