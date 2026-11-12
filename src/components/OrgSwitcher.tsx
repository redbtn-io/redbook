"use client";

import { ORG_COOKIE } from "@/lib/org-cookie";

export interface OrgOption {
  orgId: string;
  orgName: string;
}

/**
 * Switch the active book without signing out. The choice is stored in a
 * cookie (the redSocial brand-selection pattern), so it survives reloads
 * and every API call the page makes carries it, then the app reloads at
 * the root, because a client record from the previous org is not valid in
 * the new one.
 */
export function OrgSwitcher({
  orgs,
  activeOrgId,
}: {
  orgs: OrgOption[];
  activeOrgId: string;
}) {
  return (
    <select
      // Keyed by the resolved org and closed to form restoration, so the
      // browser can never resurrect a previous choice over the value the
      // server resolved for this render. What the switcher shows is the
      // org the page body rendered, on first paint, with no interaction.
      key={activeOrgId}
      autoComplete="off"
      aria-label="Switch organization"
      className="shrink-0 rounded-md border border-border bg-bg-primary px-2 py-0.5 text-xs text-text-secondary"
      value={activeOrgId}
      onChange={(event) => {
        const orgId = event.target.value;
        document.cookie = `${ORG_COOKIE}=${encodeURIComponent(orgId)}; path=/; max-age=31536000; samesite=lax`;
        window.location.assign("/");
      }}
    >
      {orgs.map((org) => (
        <option key={org.orgId} value={org.orgId}>
          {org.orgName}
        </option>
      ))}
    </select>
  );
}
