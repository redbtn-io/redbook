import { Shell } from "@/components/Shell";
import { ClientsView, type ClientWithStats } from "@/components/ClientsView";
import { requirePrincipal } from "@/lib/server-session";
import { resolveActiveOrg } from "@/lib/redorg";
import { ensureSeeded } from "@/lib/seed";
import { listClients, summarizeClients } from "@/lib/repository";

/**
 * The org's book. Gated server-side: an unauthenticated visitor is redirected
 * to accounts.redbtn.io before any data is fetched, so nothing renders and no
 * query runs for a caller without a verified session.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const principal = await requirePrincipal("/");
  const resolved = await resolveActiveOrg(principal);
  if (!resolved) {
    return (
      <Shell email={principal.email}>
        <p className="text-text-secondary">You are not a member of any book yet.</p>
      </Shell>
    );
  }

  const { membership, memberships } = resolved;
  await ensureSeeded(membership, principal);

  const [clients, summaries] = await Promise.all([
    listClients(membership),
    summarizeClients(membership),
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
    <Shell email={principal.email} orgName={membership.orgName} orgCount={memberships.length}>
      <ClientsView initialClients={withStats} orgName={membership.orgName} />
    </Shell>
  );
}
