import { Shell } from "@/components/Shell";
import { Landing } from "@/components/Landing";
import { ClientsView, type ClientWithStats } from "@/components/ClientsView";
import { getPrincipal } from "@/lib/server-session";
import { getConfig, signInUrl } from "@/lib/config";
import { safeNextPath } from "@/lib/next-path";
import { resolvePageOrg } from "@/lib/active-org";
import { isBookOrg } from "@/lib/redorg";
import { ensureSeeded } from "@/lib/seed";
import { listClients, summarizeClients } from "@/lib/repository";

/**
 * Root is the one public page: a visitor with no session gets a short landing
 * and signs in at accounts.redbtn.io; a member gets the org's book, exactly as
 * before.
 *
 * Still gated server-side, and still gated FIRST — no org is resolved, nothing
 * is seeded and no query runs for a caller without a verified session. Every
 * other page keeps bouncing straight to sign-in via `requirePrincipal`, so a
 * deep link is never lost.
 */
export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; org?: string | string[] }>;
}) {
  const principal = await getPrincipal();

  if (!principal) {
    const { next } = await searchParams;
    const requested = typeof next === "string" ? next : null;
    return <Landing signInHref={signInUrl(getConfig(), safeNextPath(requested) ?? "/")} />;
  }

  // One resolution for the whole page: the switcher in the header and the
  // book in the body both render from this result, so they cannot disagree
  // about which org is active on first load.
  const { org } = await searchParams;
  const resolved = await resolvePageOrg(principal, org);
  if (!resolved) {
    return (
      <Shell email={principal.email}>
        <p className="text-text-secondary">You are not a member of any book yet.</p>
      </Shell>
    );
  }

  const { membership, memberships } = resolved;
  if (await isBookOrg(membership.orgId)) {
    await ensureSeeded(membership, principal);
  }

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
    <Shell
      email={principal.email}
      orgName={membership.orgName}
      orgCount={memberships.length}
      orgs={memberships}
      activeOrgId={membership.orgId}
    >
      <ClientsView initialClients={withStats} orgName={membership.orgName} />
    </Shell>
  );
}
