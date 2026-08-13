import Link from "next/link";

/**
 * App chrome: brand, which book you are looking at, the signed-in identity,
 * and a sign-out link.
 *
 * The org name is shown because the book is shared — a member needs to know
 * whose pipeline is on screen, especially once someone belongs to more than
 * one.
 */
export function Shell({
  email,
  orgName,
  orgCount = 1,
  children,
  breadcrumb,
}: {
  email: string;
  orgName?: string;
  orgCount?: number;
  children: React.ReactNode;
  breadcrumb?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg-primary">
      <header className="sticky top-0 z-40 border-b border-border bg-bg-primary/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold text-text-primary">
            <span aria-hidden className="inline-block h-3 w-3 rounded-full bg-accent" />
            redBook
          </Link>
          {orgName ? (
            <span
              className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-text-secondary"
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
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <span className="hidden text-sm text-text-muted sm:inline">{email}</span>
            <Link
              href="/signout"
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover"
            >
              Sign out
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
