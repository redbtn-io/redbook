import { notFound } from "next/navigation";

import { Shell } from "@/components/Shell";
import { ClientDetail } from "@/components/ClientDetail";
import { requirePrincipal } from "@/lib/server-session";
import { getClient, listContacts, listInteractions, listNotes } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const principal = await requirePrincipal(`/clients/${clientId}`);

  const client = await getClient(principal, clientId);
  // Owner-scoped lookup: someone else's client is indistinguishable from one
  // that does not exist, which is the intended behaviour.
  if (!client) notFound();

  const [contacts, notes, interactions] = await Promise.all([
    listContacts(principal, clientId),
    listNotes(principal, clientId),
    listInteractions(principal, clientId),
  ]);

  return (
    <Shell email={principal.email} breadcrumb={client.name}>
      <ClientDetail client={client} contacts={contacts} notes={notes} interactions={interactions} />
    </Shell>
  );
}
