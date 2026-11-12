import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { Shell } from "@/components/Shell";
import { ClientDetail } from "@/components/ClientDetail";
import { requirePrincipal } from "@/lib/server-session";
import { ORG_COOKIE } from "@/lib/org-cookie";
import { resolveActiveOrg } from "@/lib/redorg";
import { getClient, listContacts, listInteractions, listNotes } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ org?: string | string[] }>;
}) {
  const { clientId } = await params;
  const principal = await requirePrincipal(`/clients/${clientId}`);
  const { org } = await searchParams;
  const cookieStore = await cookies();
  const requestedOrg =
    (typeof org === "string" ? org : null) ?? cookieStore.get(ORG_COOKIE)?.value ?? null;
  let resolved = await resolveActiveOrg(principal, requestedOrg);
  if (!resolved && requestedOrg) resolved = await resolveActiveOrg(principal);
  if (!resolved) notFound();

  const { membership, memberships } = resolved;
  const client = await getClient(membership, clientId);
  // Org-scoped lookup: another tenant's client is indistinguishable from one
  // that does not exist, which is the intended behaviour.
  if (!client) notFound();

  const [contacts, notes, interactions] = await Promise.all([
    listContacts(membership, clientId),
    listNotes(membership, clientId),
    listInteractions(membership, clientId),
  ]);

  return (
    <Shell
      email={principal.email}
      orgName={membership.orgName}
      orgCount={memberships.length}
      orgs={memberships}
      activeOrgId={membership.orgId}
      breadcrumb={client.name}
    >
      <ClientDetail client={client} contacts={contacts} notes={notes} interactions={interactions} />
    </Shell>
  );
}
