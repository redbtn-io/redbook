import { errorResponse, json, readJsonBody, withPrincipal } from "@/lib/api";
import { validateContact, type ContactInput } from "@/lib/crm";
import { createContact, getClient, listContacts } from "@/lib/repository";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ clientId: string }> };

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { clientId } = await params;
  return withPrincipal(request, async (principal) => {
    // Confirm the parent belongs to this caller before listing children, so a
    // guessed clientId cannot enumerate another user's contacts.
    if (!(await getClient(principal, clientId))) return errorResponse(404, "Not Found");
    return json({ contacts: await listContacts(principal, clientId) });
  });
}

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { clientId } = await params;
  return withPrincipal(request, async (principal) => {
    if (!(await getClient(principal, clientId))) return errorResponse(404, "Not Found");
    const body = await readJsonBody(request);
    if (!body.ok) return errorResponse(400, body.error);
    const validated = validateContact(body.value);
    if (!validated.ok) return errorResponse(400, validated.error);
    const contact = await createContact(principal, clientId, validated.value as ContactInput);
    return json({ contact }, 201);
  });
}
