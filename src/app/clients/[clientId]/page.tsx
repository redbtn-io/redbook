import { notFound } from "next/navigation";

import { Shell } from "@/components/Shell";
import { ClientDetail } from "@/components/ClientDetail";
import { requirePrincipal } from "@/lib/server-session";
import { resolveActiveOrg } from "@/lib/redorg";
import { getClient, listContacts, listInteractions, listNotes } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const principal = await requirePrincipal(`/clients/${clientId}`);
  const resolved = await resolveActiveOrg(principal);
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
      breadcrumb={client.name}
    >
      <ClientDetail client={client} contacts={contacts} notes={notes} interactions={interactions} />
    </Shell>
  );
}
