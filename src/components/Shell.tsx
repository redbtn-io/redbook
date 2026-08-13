import Link from "next/link";

/** App chrome: brand, the signed-in identity, and a sign-out link. */
export function Shell({
  email,
  children,
  breadcrumb,
}: {
  email: string;
  children: React.ReactNode;
  breadcrumb?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg-primary">
      <header className="sticky top-0 z-40 border-b border-border bg-bg-primary/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold text-text-primary">
            <span aria-hidden className="inline-block h-3 w-3 rounded-full bg-accent" />
            redBook
          </Link>
          {breadcrumb ? (
            <>
              <span className="text-text-disabled" aria-hidden>
                /
              </span>
              <div className="min-w-0 truncate text-sm text-text-secondary">{breadcrumb}</div>
            </>
          ) : null}
          <div className="ml-auto flex items-center gap-3">
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
