import { errorResponse, json, readJsonBody, withOrg } from "@/lib/api";
import { validateNote } from "@/lib/crm";
import { deleteNote, updateNote } from "@/lib/repository";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ noteId: string }> };

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { noteId } = await params;
  return withOrg(request, async ({ membership, principal }) => {
    const body = await readJsonBody(request);
    if (!body.ok) return errorResponse(400, body.error);
    const validated = validateNote(body.value, { partial: true });
    if (!validated.ok) return errorResponse(400, validated.error);
    const note = await updateNote(membership, noteId, validated.value);
    if (!note) return errorResponse(404, "Not Found");
    return json({ note });
  });
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const { noteId } = await params;
  return withOrg(request, async ({ membership, principal }) => {
    const removed = await deleteNote(membership, noteId);
    if (!removed) return errorResponse(404, "Not Found");
    return json({ deleted: true });
  });
}
