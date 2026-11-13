import Link from "next/link";

import { OrgSwitcher, type OrgOption } from "@/components/OrgSwitcher";

/**
 * App chrome: brand, which book you are looking at, the signed-in identity,
 * and a sign-out link.
 *
 * The org name is shown because the book is shared — a member needs to know
 * whose pipeline is on screen, especially once someone belongs to more than
 * one. With several orgs the name becomes a switcher; with one org it stays
 * a plain label, so a single-book user never sees switcher chrome.
 */
export function Shell({
  email,
  orgName,
  orgCount = 1,
  orgs,
  activeOrgId,
  children,
  breadcrumb,
}: {
  email: string;
  orgName?: string;
  orgCount?: number;
  orgs?: OrgOption[];
  activeOrgId?: string;
  children: React.ReactNode;
  breadcrumb?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg-primary">
      <header className="sticky top-0 z-40 border-b border-border bg-bg-primary/85 backdrop-blur">
        {/*
          The row wraps on small screens, deliberately. It used to be one
          non-wrapping row of shrink-0 segments, and the org switcher (a
          native select sized by its longest option, and org names are
          email-shaped and long) pushed the row's minimum width past a
          phone viewport, which widened the WHOLE document: at 390px the
          page rendered 512px wide and every screen in the app overflowed
          on both sides. No segment here is shrink-0 anymore except the
          brand, and the switcher truncates instead of widening.
        */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:h-14 sm:flex-nowrap sm:px-6 sm:py-0">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold text-text-primary">
            <span aria-hidden className="inline-block h-3 w-3 rounded-full bg-accent" />
            redBook
          </Link>
          {orgs && orgs.length > 1 && activeOrgId ? (
            <OrgSwitcher orgs={orgs} activeOrgId={activeOrgId} />
          ) : orgName ? (
            <span
              className="min-w-0 max-w-44 truncate rounded-md border border-border px-2 py-1 text-xs text-text-secondary sm:max-w-none"
              title={orgCount > 1 ? `${orgCount} books available` : undefined}
            >
              {orgName}
            </span>
          ) : null}
          {breadcrumb ? (
            <>
              <span className="text-text-disabled" aria-hidden>
                /
              </span>
              <div className="min-w-0 truncate text-sm text-text-secondary">{breadcrumb}</div>
            </>
          ) : null}
          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            {orgName ? (
              <Link
                href="/members"
                className="flex min-h-11 items-center rounded-lg px-2 text-sm text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary sm:min-h-0 sm:py-1.5"
              >
                Members
              </Link>
            ) : null}
            {/*
              The signed-in identity doubles as the way into the one personal
              surface, `/account` — where redbtn billing lives, because it is
              this human's and not the book's.

              `prefetch={false}` is deliberate. That page calls billing.redbtn.io
              on render, and Next prefetches in-viewport links, so leaving it on
              would fire a live Stripe-backed request on every page view that
              nobody asked for. Same lesson as the sign-out prefetch bug: a
              prefetcher issues requests no user clicked.
            */}
            <Link
              href="/account"
              prefetch={false}
              className="hidden rounded-lg px-2 py-1.5 text-sm text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary sm:inline-block"
            >
              {email}
            </Link>
            {/*
              A form, not a `<Link>`. Sign-out mutates, so it must be a POST:
              Next.js prefetches in-viewport links, and when this was a link to
              a GET route the prefetch silently cleared the shared `.redbtn.io`
              session on every page render — signing the user out of redBook
              and every other redApp just for loading a page. Forms are never
              prefetched, and this one needs no JavaScript to work.
            */}
            <form method="post" action="/signout">
              <button
                type="submit"
                className="min-h-11 rounded-lg border border-border px-3 text-sm text-text-secondary transition-colors hover:bg-bg-hover sm:min-h-0 sm:py-1.5"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
