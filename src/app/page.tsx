import { Shell } from "@/components/Shell";
import { ClientsView, type ClientWithStats } from "@/components/ClientsView";
import { requirePrincipal } from "@/lib/server-session";
import { ensureSeeded } from "@/lib/seed";
import { listClients, summarizeClients } from "@/lib/repository";

/**
 * The book. Gated server-side: an unauthenticated visitor is redirected to
 * accounts.redbtn.io before any data is fetched, so nothing renders and no
 * query runs for a caller without a verified session.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const principal = await requirePrincipal("/");
  await ensureSeeded(principal);

  const [clients, summaries] = await Promise.all([
    listClients(principal),
    summarizeClients(principal),
  ]);

  const withStats: ClientWithStats[] = clients.map((client) => ({
    ...client,
    stats: summaries.get(client.id) ?? {
      clientId: client.id,
      contactCount: 0,
      noteCount: 0,
      interactionCount: 0,
    },
  }));

  return (
    <Shell email={principal.email}>
      <ClientsView initialClients={withStats} />
    </Shell>
  );
}
