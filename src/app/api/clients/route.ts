import { errorResponse, json, readJsonBody, withOrg } from "@/lib/api";
import { validateClient, type ClientInput } from "@/lib/crm";
import { createClient, listClients, summarizeClients } from "@/lib/repository";

export const dynamic = "force-dynamic";

/** The caller's whole book, with per-client roll-ups for the list view. */
export async function GET(request: Request): Promise<Response> {
  return withOrg(request, async ({ membership }) => {
    const [clients, summaries] = await Promise.all([
      listClients(membership),
      summarizeClients(membership),
    ]);
    return json({
      clients: clients.map((client) => ({
        ...client,
        stats: summaries.get(client.id) ?? {
          clientId: client.id,
          contactCount: 0,
          noteCount: 0,
          interactionCount: 0,
        },
      })),
    });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withOrg(request, async ({ membership, principal }) => {
    const body = await readJsonBody(request);
    if (!body.ok) return errorResponse(400, body.error);
    const validated = validateClient(body.value);
    if (!validated.ok) return errorResponse(400, validated.error);
    const client = await createClient(membership, principal, validated.value as ClientInput);
    return json({ client }, 201);
  });
}
