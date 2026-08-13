"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@redbtn/redstyle";

import {
  INTERACTION_TYPES,
  type Client,
  type Contact,
  type Interaction,
  type InteractionType,
  type Note,
} from "@/lib/crm";
import {
  INTERACTION_LABELS,
  STATUS_LABELS,
  STATUS_VARIANTS,
  formatCurrency,
  formatDate,
  formatDateTime,
  relativeDays,
} from "@/lib/format";

interface Props {
  client: Client;
  contacts: Contact[];
  notes: Note[];
  interactions: Interaction[];
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string; data?: never }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    return { ok: false, error: payload.error ?? "Request failed" };
  }
  return { ok: true };
}

async function remove(url: string): Promise<boolean> {
  const response = await fetch(url, { method: "DELETE" });
  return response.ok;
}

export function ClientDetail({ client, contacts, notes, interactions }: Props) {
  const router = useRouter();

  return (
    <div className="space-y-6 select-content">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-text-primary">{client.name}</h1>
            <Badge variant={STATUS_VARIANTS[client.status]}>{STATUS_LABELS[client.status]}</Badge>
          </div>
          {client.industry ? <p className="mt-1 text-text-secondary">{client.industry}</p> : null}
          {client.website ? (
            <a
              href={client.website}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-block text-sm text-accent-text hover:underline"
            >
              {client.website}
            </a>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-text-muted">ARR</dt>
            <dd className="text-text-primary">{formatCurrency(client.arr)}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Renewal</dt>
            <dd className="text-text-primary">
              {formatDate(client.renewalDate)}
              {client.renewalDate ? (
                <span className="block text-xs text-text-muted">{relativeDays(client.renewalDate)}</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Owner</dt>
            <dd className="text-text-primary">{client.owner || "—"}</dd>
          </div>
        </dl>
      </header>

      {client.summary ? (
        <Card className="p-4 sm:p-6">
          <h2 className="text-sm font-medium text-text-muted">Account summary</h2>
          <p className="prose-plain mt-2 text-sm text-text-secondary">{client.summary}</p>
        </Card>
      ) : null}

      {client.tags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {client.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}

      <Tabs defaultValue="interactions">
        <TabsList>
          <TabsTrigger value="interactions">Interactions ({interactions.length})</TabsTrigger>
          <TabsTrigger value="contacts">Contacts ({contacts.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="interactions">
          <InteractionsPanel clientId={client.id} interactions={interactions} onChange={() => router.refresh()} />
        </TabsContent>
        <TabsContent value="contacts">
          <ContactsPanel clientId={client.id} contacts={contacts} onChange={() => router.refresh()} />
        </TabsContent>
        <TabsContent value="notes">
          <NotesPanel clientId={client.id} notes={notes} onChange={() => router.refresh()} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ------------------------------------------------------------ interactions

function InteractionsPanel({
  clientId,
  interactions,
  onChange,
}: {
  clientId: string;
  interactions: Interaction[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: "call" as InteractionType,
    subject: "",
    occurredAt: new Date().toISOString().slice(0, 10),
    participants: "",
    summary: "",
    transcript: "",
    followUps: "",
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await post(`/api/clients/${clientId}/interactions`, {
      type: form.type,
      subject: form.subject,
      occurredAt: form.occurredAt ? new Date(`${form.occurredAt}T12:00:00Z`).toISOString() : undefined,
      participants: splitLines(form.participants),
      summary: form.summary || undefined,
      transcript: form.transcript || undefined,
      followUps: splitLines(form.followUps),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Could not log the interaction");
      return;
    }
    setForm({ ...form, subject: "", participants: "", summary: "", transcript: "", followUps: "" });
    setOpen(false);
    onChange();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen((value) => !value)}>
          {open ? "Cancel" : "Log interaction"}
        </Button>
      </div>

      {open ? (
        <Card className="p-4 sm:p-6">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="type">Type</Label>
                <Select
                  value={form.type}
                  onChange={(value) => setForm({ ...form, type: value as InteractionType })}
                  options={INTERACTION_TYPES.map((type) => ({
                    value: type,
                    label: INTERACTION_LABELS[type],
                  }))}
                />
              </div>
              <div className="sm:col-span-2">
                <Input
                  label="Subject"
                  required
                  value={form.subject}
                  onChange={(event) => setForm({ ...form, subject: event.target.value })}
                  placeholder="Quarterly business review"
                />
              </div>
              <Input
                label="Date"
                type="date"
                value={form.occurredAt}
                onChange={(event) => setForm({ ...form, occurredAt: event.target.value })}
              />
              <div className="sm:col-span-2">
                <Input
                  label="Participants (one per line or comma separated)"
                  value={form.participants}
                  onChange={(event) => setForm({ ...form, participants: event.target.value })}
                  placeholder="Dana Whitfield, Josh"
                />
              </div>
            </div>
            <Textarea
              label="Summary"
              rows={3}
              value={form.summary}
              onChange={(event) => setForm({ ...form, summary: event.target.value })}
              placeholder="What happened, and what changed as a result?"
            />
            <Textarea
              label="Transcript or long-form notes"
              rows={5}
              value={form.transcript}
              onChange={(event) => setForm({ ...form, transcript: event.target.value })}
              placeholder="Paste the transcript here."
            />
            <Textarea
              label="Follow-ups (one per line)"
              rows={3}
              value={form.followUps}
              onChange={(event) => setForm({ ...form, followUps: event.target.value })}
            />
            {error ? <p className="text-sm text-error">{error}</p> : null}
            <Button type="submit" disabled={saving || !form.subject.trim()}>
              {saving ? "Saving…" : "Save interaction"}
            </Button>
          </form>
        </Card>
      ) : null}

      {interactions.length === 0 ? (
        <EmptyState message="No interactions logged yet." />
      ) : (
        <ol className="space-y-3">
          {interactions.map((interaction) => (
            <li key={interaction.id}>
              <Card className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="info">{INTERACTION_LABELS[interaction.type]}</Badge>
                      <h3 className="font-medium text-text-primary">{interaction.subject}</h3>
                    </div>
                    <p className="mt-1 text-xs text-text-muted">
                      {formatDateTime(interaction.occurredAt)}
                      {interaction.participants.length > 0
                        ? ` · ${interaction.participants.join(", ")}`
                        : ""}
                    </p>
                  </div>
                  <DeleteButton
                    label="interaction"
                    onDelete={async () => {
                      if (await remove(`/api/interactions/${interaction.id}`)) onChange();
                    }}
                  />
                </div>

                {interaction.summary ? (
                  <p className="prose-plain mt-3 text-sm text-text-secondary">{interaction.summary}</p>
                ) : null}

                {interaction.followUps.length > 0 ? (
                  <div className="mt-3">
                    <h4 className="text-xs font-medium uppercase tracking-wide text-text-muted">
                      Follow-ups
                    </h4>
                    <ul className="mt-1 list-inside list-disc text-sm text-text-secondary">
                      {interaction.followUps.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {interaction.transcript ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-accent-text">Transcript</summary>
                    <p className="prose-plain mt-2 rounded-lg bg-bg-tertiary p-3 font-mono text-xs text-text-secondary">
                      {interaction.transcript}
                    </p>
                  </details>
                ) : null}
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- contacts

function ContactsPanel({
  clientId,
  contacts,
  onChange,
}: {
  clientId: string;
  contacts: Contact[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", title: "", email: "", phone: "", notes: "", isPrimary: false });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await post(`/api/clients/${clientId}/contacts`, {
      name: form.name,
      title: form.title || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      notes: form.notes || undefined,
      isPrimary: form.isPrimary,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Could not add the contact");
      return;
    }
    setForm({ name: "", title: "", email: "", phone: "", notes: "", isPrimary: false });
    setOpen(false);
    onChange();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen((value) => !value)}>
          {open ? "Cancel" : "Add contact"}
        </Button>
      </div>

      {open ? (
        <Card className="p-4 sm:p-6">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Name"
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
              <Input
                label="Title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
              <Input
                label="Phone"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </div>
            <Textarea
              label="Notes"
              rows={2}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={form.isPrimary}
                onChange={(event) => setForm({ ...form, isPrimary: event.target.checked })}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Primary contact
            </label>
            {error ? <p className="text-sm text-error">{error}</p> : null}
            <Button type="submit" disabled={saving || !form.name.trim()}>
              {saving ? "Saving…" : "Add contact"}
            </Button>
          </form>
        </Card>
      ) : null}

      {contacts.length === 0 ? (
        <EmptyState message="No contacts yet." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {contacts.map((contact) => (
            <Card key={contact.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-text-primary">{contact.name}</h3>
                    {contact.isPrimary ? <Badge variant="default">Primary</Badge> : null}
                  </div>
                  {contact.title ? (
                    <p className="text-sm text-text-secondary">{contact.title}</p>
                  ) : null}
                </div>
                <DeleteButton
                  label="contact"
                  onDelete={async () => {
                    if (await remove(`/api/contacts/${contact.id}`)) onChange();
                  }}
                />
              </div>
              <dl className="mt-3 space-y-1 text-sm">
                {contact.email ? (
                  <div className="flex gap-2">
                    <dt className="text-text-muted">Email</dt>
                    <dd>
                      <a href={`mailto:${contact.email}`} className="text-accent-text hover:underline">
                        {contact.email}
                      </a>
                    </dd>
                  </div>
                ) : null}
                {contact.phone ? (
                  <div className="flex gap-2">
                    <dt className="text-text-muted">Phone</dt>
                    <dd>
                      <a href={`tel:${contact.phone}`} className="text-accent-text hover:underline">
                        {contact.phone}
                      </a>
                    </dd>
                  </div>
                ) : null}
              </dl>
              {contact.notes ? (
                <p className="prose-plain mt-3 text-sm text-text-secondary">{contact.notes}</p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- notes

function NotesPanel({
  clientId,
  notes,
  onChange,
}: {
  clientId: string;
  notes: Note[];
  onChange: () => void;
}) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await post(`/api/clients/${clientId}/notes`, { body, pinned: false });
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Could not save the note");
      return;
    }
    setBody("");
    onChange();
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-6">
        <form onSubmit={submit} className="space-y-3">
          <Textarea
            label="New note"
            rows={4}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="What should the next person to open this account know?"
          />
          {error ? <p className="text-sm text-error">{error}</p> : null}
          <Button type="submit" disabled={saving || !body.trim()}>
            {saving ? "Saving…" : "Add note"}
          </Button>
        </form>
      </Card>

      {notes.length === 0 ? (
        <EmptyState message="No notes yet." />
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li key={note.id}>
              <Card className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-text-muted">
                    {formatDateTime(note.createdAt)}
                    {note.pinned ? " · pinned" : ""}
                  </p>
                  <DeleteButton
                    label="note"
                    onDelete={async () => {
                      if (await remove(`/api/notes/${note.id}`)) onChange();
                    }}
                  />
                </div>
                <p className="prose-plain mt-2 text-sm text-text-secondary">{note.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ shared

function EmptyState({ message }: { message: string }) {
  return (
    <Card className="p-10 text-center">
      <p className="text-text-secondary">{message}</p>
    </Card>
  );
}

function DeleteButton({ label, onDelete }: { label: string; onDelete: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} aria-label={`Delete ${label}`}>
        Delete
      </Button>
    );
  }
  return (
    <span className="flex gap-1">
      <Button size="sm" variant="destructive" onClick={onDelete}>
        Confirm
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </span>
  );
}

/** Accepts either newline- or comma-separated input, which is what people type. */
function splitLines(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}
