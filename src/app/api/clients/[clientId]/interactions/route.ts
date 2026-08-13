import { errorResponse, json, readJsonBody, withPrincipal } from "@/lib/api";
import { validateInteraction, type InteractionInput } from "@/lib/crm";
import { createInteraction, getClient, listInteractions } from "@/lib/repository";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ clientId: string }> };

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { clientId } = await params;
  return withPrincipal(request, async (principal) => {
    if (!(await getClient(principal, clientId))) return errorResponse(404, "Not Found");
    return json({ interactions: await listInteractions(principal, clientId) });
  });
}

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { clientId } = await params;
  return withPrincipal(request, async (principal) => {
    if (!(await getClient(principal, clientId))) return errorResponse(404, "Not Found");
    const body = await readJsonBody(request);
    if (!body.ok) return errorResponse(400, body.error);
    const validated = validateInteraction(body.value);
    if (!validated.ok) return errorResponse(400, validated.error);
    const interaction = await createInteraction(
      principal,
      clientId,
      validated.value as InteractionInput,
    );
    return json({ interaction }, 201);
  });
}
