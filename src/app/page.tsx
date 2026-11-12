import { cookies } from "next/headers";

import { Shell } from "@/components/Shell";
import { Landing } from "@/components/Landing";
import { ClientsView, type ClientWithStats } from "@/components/ClientsView";
import { getPrincipal } from "@/lib/server-session";
import { getConfig, signInUrl } from "@/lib/config";
import { safeNextPath } from "@/lib/next-path";
import { ORG_COOKIE } from "@/lib/org-cookie";
import { isBookOrg, resolveActiveOrg } from "@/lib/redorg";
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

  // Org selection, redSocial pattern: an explicit `org` parameter on the
  // link wins, then the last-used-org cookie, then the default book.
  const { org } = await searchParams;
  const cookieStore = await cookies();
  const requestedOrg =
    (typeof org === "string" ? org : null) ?? cookieStore.get(ORG_COOKIE)?.value ?? null;
  let resolved = await resolveActiveOrg(principal, requestedOrg);
  if (!resolved && requestedOrg) {
    // A stale ref (an org the user has since left) must not strand them on
    // an empty state; fall back to their default book.
    resolved = await resolveActiveOrg(principal);
  }
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
