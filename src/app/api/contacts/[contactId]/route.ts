import { errorResponse, json, readJsonBody, withOrg } from "@/lib/api";
import { validateContact } from "@/lib/crm";
import { deleteContact, updateContact } from "@/lib/repository";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ contactId: string }> };

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { contactId } = await params;
  return withOrg(request, async ({ membership, principal }) => {
    const body = await readJsonBody(request);
    if (!body.ok) return errorResponse(400, body.error);
    const validated = validateContact(body.value, { partial: true });
    if (!validated.ok) return errorResponse(400, validated.error);
    const contact = await updateContact(membership, contactId, validated.value);
    if (!contact) return errorResponse(404, "Not Found");
    return json({ contact });
  });
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const { contactId } = await params;
  return withOrg(request, async ({ membership, principal }) => {
    const removed = await deleteContact(membership, contactId);
    if (!removed) return errorResponse(404, "Not Found");
    return json({ deleted: true });
  });
}
