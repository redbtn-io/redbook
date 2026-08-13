import { errorResponse, json, readJsonBody, withOrg } from "@/lib/api";
import { validateNote, type NoteInput } from "@/lib/crm";
import { createNote, getClient, listNotes } from "@/lib/repository";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ clientId: string }> };

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { clientId } = await params;
  return withOrg(request, async ({ membership, principal }) => {
    if (!(await getClient(membership, clientId))) return errorResponse(404, "Not Found");
    return json({ notes: await listNotes(membership, clientId) });
  });
}

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { clientId } = await params;
  return withOrg(request, async ({ membership, principal }) => {
    if (!(await getClient(membership, clientId))) return errorResponse(404, "Not Found");
    const body = await readJsonBody(request);
    if (!body.ok) return errorResponse(400, body.error);
    const validated = validateNote(body.value);
    if (!validated.ok) return errorResponse(400, validated.error);
    const note = await createNote(membership, principal, clientId, validated.value as NoteInput);
    return json({ note }, 201);
  });
}
