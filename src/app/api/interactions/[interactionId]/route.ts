import { errorResponse, json, readJsonBody, withOrg } from "@/lib/api";
import { validateInteraction } from "@/lib/crm";
import { deleteInteraction, updateInteraction } from "@/lib/repository";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ interactionId: string }> };

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { interactionId } = await params;
  return withOrg(request, async ({ membership, principal }) => {
    const body = await readJsonBody(request);
    if (!body.ok) return errorResponse(400, body.error);
    const validated = validateInteraction(body.value, { partial: true });
    if (!validated.ok) return errorResponse(400, validated.error);
    const interaction = await updateInteraction(membership, interactionId, validated.value);
    if (!interaction) return errorResponse(404, "Not Found");
    return json({ interaction });
  });
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const { interactionId } = await params;
  return withOrg(request, async ({ membership, principal }) => {
    const removed = await deleteInteraction(membership, interactionId);
    if (!removed) return errorResponse(404, "Not Found");
    return json({ deleted: true });
  });
}
