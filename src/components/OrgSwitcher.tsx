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
      // min-w-0 and a mobile cap, never shrink-0: a native select sizes to
      // its longest option, org names are email-shaped and long, and as a
      // shrink-0 flex item this one control used to set the whole page's
      // minimum width past a phone viewport. Constrained, it truncates
      // the shown name instead of widening the document.
      className="min-h-11 min-w-0 max-w-48 flex-1 rounded-md border border-border bg-bg-primary px-2 text-xs text-text-secondary sm:min-h-0 sm:max-w-72 sm:flex-none sm:py-0.5"
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
