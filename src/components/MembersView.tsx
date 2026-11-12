"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, Select } from "@redbtn/redstyle";

export interface MemberRow {
  userId: string;
  email: string;
  name: string | null;
  roleSlugs: string[];
  status: string;
  isOwner: boolean;
  joinedAt: string | null;
}

export interface PendingSeatRow {
  email: string;
  roleSlug: string;
  createdAt: string | null;
}

export interface RoleOption {
  slug: string;
  name: string;
}

function roleLabel(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

/**
 * Members and pending seats for one org. Members come from the shared
 * directory; pending seats are addresses still waiting for a first sign
 * in. Inviting an address that already has a redbtn account adds that
 * person immediately; any other address becomes a pending seat.
 */
export function MembersView({
  orgId,
  orgName,
  currentUserId,
  members,
  pendingSeats,
  roles,
  canInvite,
  canManage,
}: {
  orgId: string;
  orgName: string;
  currentUserId: string;
  members: MemberRow[];
  pendingSeats: PendingSeatRow[];
  roles: RoleOption[];
  canInvite: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [editingSeat, setEditingSeat] = useState<string | null>(null);
  const [seatEmailDraft, setSeatEmailDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: () => Promise<Response>, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await action();
      if (!response.ok) {
        setError(await readError(response));
        return false;
      }
      setNotice(success);
      router.refresh();
      return true;
    } catch {
      setError("Network error. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    const ok = await run(
      () =>
        fetch(`/api/orgs/${orgId}/members`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, roleSlug: inviteRole }),
        }),
      `Seat saved for ${email}.`,
    );
    if (ok) setInviteEmail("");
  }

  async function saveSeatEmail(email: string) {
    const newEmail = seatEmailDraft.trim();
    if (!newEmail) return;
    const ok = await run(
      () =>
        fetch(`/api/orgs/${orgId}/members/pending`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, newEmail }),
        }),
      `Seat now waits for ${newEmail}.`,
    );
    if (ok) setEditingSeat(null);
  }

  async function revokeSeat(email: string) {
    if (!window.confirm(`Revoke the pending seat for ${email}?`)) return;
    await run(
      () =>
        fetch(`/api/orgs/${orgId}/members/pending?email=${encodeURIComponent(email)}`, {
          method: "DELETE",
        }),
      `Pending seat for ${email} revoked.`,
    );
  }

  async function removeMember(member: MemberRow) {
    if (!window.confirm(`Remove ${member.email} from ${orgName}?`)) return;
    await run(
      () => fetch(`/api/orgs/${orgId}/members/${member.userId}`, { method: "DELETE" }),
      `${member.email} removed.`,
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Members</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Who can see and work in {orgName}, and the seats still waiting to be claimed.
        </p>
      </div>

      {error ? <p className="text-sm text-error">{error}</p> : null}
      {notice ? <p className="text-sm text-text-secondary">{notice}</p> : null}

      <Card className="p-4 sm:p-6">
        <h2 className="font-semibold text-text-primary">Members</h2>
        {members.length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">No members yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {members.map((member) => (
              <li key={member.userId} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {member.name ?? member.email}
                    {member.userId === currentUserId ? (
                      <span className="text-text-muted"> (you)</span>
                    ) : null}
                  </p>
                  <p className="truncate text-sm text-text-muted">{member.email}</p>
                </div>
                <span className="text-sm text-text-secondary">
                  {member.isOwner
                    ? "Owner"
                    : member.roleSlugs.map(roleLabel).join(", ") || "Member"}
                </span>
                {member.status !== "active" ? (
                  <span className="text-xs text-text-muted">{member.status}</span>
                ) : null}
                {canManage && !member.isOwner ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void removeMember(member)}
                  >
                    Remove
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4 sm:p-6">
        <h2 className="font-semibold text-text-primary">Pending seats</h2>
        <p className="mt-1 text-sm text-text-secondary">
          These addresses have no membership yet. A seat converts into a membership the first
          time someone signs in with that exact email address.
        </p>
        {pendingSeats.length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">No pending seats.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {pendingSeats.map((seat) => (
              <li key={seat.email} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  {editingSeat === seat.email ? (
                    <Input
                      label="Seat email"
                      value={seatEmailDraft}
                      onChange={(event) => setSeatEmailDraft(event.target.value)}
                    />
                  ) : (
                    <>
                      <p className="truncate text-sm font-medium text-text-primary">{seat.email}</p>
                      <p className="text-sm text-text-muted">
                        Waiting as {roleLabel(seat.roleSlug)}, not yet claimed
                      </p>
                    </>
                  )}
                </div>
                {canManage ? (
                  editingSeat === seat.email ? (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        disabled={busy || !seatEmailDraft.trim()}
                        onClick={() => void saveSeatEmail(seat.email)}
                      >
                        Save
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setEditingSeat(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          setEditingSeat(seat.email);
                          setSeatEmailDraft(seat.email);
                        }}
                      >
                        Edit email
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void revokeSeat(seat.email)}
                      >
                        Revoke
                      </Button>
                    </div>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canInvite ? (
        <Card className="p-4 sm:p-6">
          <h2 className="font-semibold text-text-primary">Invite or seat a member</h2>
          <form onSubmit={invite} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Email"
                type="email"
                required
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="person@company.com"
              />
              <div>
                <Label htmlFor="invite-role">Role</Label>
                <Select
                  value={inviteRole}
                  onChange={(value) => setInviteRole(value)}
                  options={roles.map((role) => ({ value: role.slug, label: role.name }))}
                />
              </div>
            </div>
            <p className="text-sm text-text-secondary">
              How seats work: if that email already has a redbtn account, the person joins this
              book right away. If not, the seat waits as pending and converts the first time
              anyone signs in with that exact email. A seat does not verify who the person is,
              so only use real work emails of people you trust, never a placeholder.
            </p>
            <Button type="submit" disabled={busy || !inviteEmail.trim()}>
              {busy ? "Saving…" : "Add member"}
            </Button>
          </form>
        </Card>
      ) : (
        <p className="text-sm text-text-secondary">
          Your role in this org can view members but cannot invite or change seats.
        </p>
      )}
    </div>
  );
}
