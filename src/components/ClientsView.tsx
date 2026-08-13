"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Label, Select, Textarea } from "@redbtn/redstyle";

import { CLIENT_STATUSES, type Client, type ClientStatus } from "@/lib/crm";
import type { ClientSummary } from "@/lib/repository";
import { STATUS_LABELS, STATUS_VARIANTS, formatCurrency, formatDate, relativeDays } from "@/lib/format";

export interface ClientWithStats extends Client {
  stats: ClientSummary;
}

const EMPTY_FORM = {
  name: "",
  industry: "",
  website: "",
  status: "prospect" as ClientStatus,
  arr: "",
  renewalDate: "",
  summary: "",
};

export function ClientsView({
  initialClients,
  orgName,
}: {
  initialClients: ClientWithStats[];
  orgName?: string;
}) {
  const router = useRouter();
  const [clients, setClients] = useState(initialClients);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return clients.filter((client) => {
      if (statusFilter !== "all" && client.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        client.name.toLowerCase().includes(needle) ||
        (client.industry ?? "").toLowerCase().includes(needle) ||
        client.tags.some((tag) => tag.toLowerCase().includes(needle))
      );
    });
  }, [clients, query, statusFilter]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          industry: form.industry || undefined,
          website: form.website || undefined,
          status: form.status,
          arr: form.arr ? Number(form.arr) : undefined,
          renewalDate: form.renewalDate || undefined,
          summary: form.summary || undefined,
          tags: [],
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Could not create the client");
        return;
      }
      setClients((current) =>
        [
          ...current,
          {
            ...payload.client,
            stats: { clientId: payload.client.id, contactCount: 0, noteCount: 0, interactionCount: 0 },
          },
        ].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setForm(EMPTY_FORM);
      setCreating(false);
      router.refresh();
    } catch {
      setError("Could not reach the server");
    } finally {
      setSaving(false);
    }
  }

  const totalArr = clients.reduce((sum, client) => sum + (client.arr ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Clients</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {orgName ? `${orgName} · ` : ""}
            {clients.length} {clients.length === 1 ? "account" : "accounts"} · {formatCurrency(totalArr)} tracked
          </p>
        </div>
        <Button onClick={() => setCreating((open) => !open)}>
          {creating ? "Cancel" : "New client"}
        </Button>
      </div>

      {creating ? (
        <Card className="p-4 sm:p-6">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Name"
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Acme Health"
              />
              <Input
                label="Industry"
                value={form.industry}
                onChange={(event) => setForm({ ...form, industry: event.target.value })}
                placeholder="Healthcare SaaS"
              />
              <Input
                label="Website"
                value={form.website}
                onChange={(event) => setForm({ ...form, website: event.target.value })}
                placeholder="https://example.com"
              />
              <div>
                <Label htmlFor="status">Status</Label>
                <Select
                  value={form.status}
                  onChange={(value) => setForm({ ...form, status: value as ClientStatus })}
                  options={CLIENT_STATUSES.map((status) => ({
                    value: status,
                    label: STATUS_LABELS[status],
                  }))}
                />
              </div>
              <Input
                label="ARR (USD)"
                type="number"
                min={0}
                value={form.arr}
                onChange={(event) => setForm({ ...form, arr: event.target.value })}
                placeholder="240000"
              />
              <Input
                label="Renewal date"
                type="date"
                value={form.renewalDate}
                onChange={(event) => setForm({ ...form, renewalDate: event.target.value })}
              />
            </div>
            <Textarea
              label="Summary"
              rows={3}
              value={form.summary}
              onChange={(event) => setForm({ ...form, summary: event.target.value })}
              placeholder="What matters about this account?"
            />
            {error ? <p className="text-sm text-error">{error}</p> : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={saving || !form.name.trim()}>
                {saving ? "Saving…" : "Create client"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <div className="min-w-52 flex-1">
          <Input
            placeholder="Search clients, industries, tags…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="w-44">
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "All statuses" },
              ...CLIENT_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] })),
            ]}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-text-secondary">
            {clients.length === 0 ? "No clients yet. Create your first one." : "No clients match that filter."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}`} className="block">
              <Card className="h-full p-4 transition-colors hover:border-border-hover hover:bg-bg-hover">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold text-text-primary">{client.name}</h2>
                  <Badge variant={STATUS_VARIANTS[client.status]}>{STATUS_LABELS[client.status]}</Badge>
                </div>
                {client.industry ? (
                  <p className="mt-1 text-sm text-text-secondary">{client.industry}</p>
                ) : null}
                <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-text-muted">ARR</dt>
                    <dd className="text-text-primary">{formatCurrency(client.arr)}</dd>
                  </div>
                  <div>
                    <dt className="text-text-muted">Renewal</dt>
                    <dd className="text-text-primary">{formatDate(client.renewalDate)}</dd>
                  </div>
                </dl>
                <p className="mt-4 text-xs text-text-muted">
                  {client.stats.contactCount} contacts · {client.stats.noteCount} notes ·{" "}
                  {client.stats.interactionCount} interactions
                  {client.stats.lastInteractionAt
                    ? ` · last ${relativeDays(client.stats.lastInteractionAt)}`
                    : ""}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
