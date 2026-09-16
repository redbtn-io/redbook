/**
 * The public face of redBook, shown at `/` to a visitor with no session.
 *
 * Short by design: say what this is, then hand sign-in to
 * accounts.redbtn.io, which is the only issuer of the shared session.
 */
const CHIPS = ["Clients and contacts", "Notes and interactions", "Automated outreach"];

export function Landing({ signInHref }: { signInHref: string }) {
  return (
    <main className="flex min-h-screen flex-col bg-bg-primary px-5 py-10 text-text-primary sm:px-8">
      <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <h1 className="text-4xl font-semibold tracking-tight">
          <span className="text-text-primary">red</span>
          <span className="text-accent">Book</span>
        </h1>
        <p className="mt-3 text-[15px] text-text-secondary">
          CRM for clients, contacts and follow-ups.
        </p>

        <ul className="mt-6 flex flex-wrap gap-2">
          {CHIPS.map((label) => (
            <li
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[13px] text-text-secondary"
            >
              <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
              {label}
            </li>
          ))}
        </ul>

        <a
          href={signInHref}
          className="mt-8 inline-flex w-full items-center justify-center rounded-lg bg-accent px-4 py-3 text-[15px] font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          Sign in with redbtn
        </a>

        <p className="mt-5 flex items-center gap-4 text-[13px] text-text-muted">
          <a className="underline-offset-4 hover:text-text-primary hover:underline" href="https://redbtn.io/apps">
            All apps
          </a>
          <a className="underline-offset-4 hover:text-text-primary hover:underline" href="https://redbtn.io">
            redbtn.io
          </a>
        </p>
      </section>

      <footer className="mx-auto w-full max-w-md pt-10 text-[12px] text-text-muted">
        Protected by redbtn single sign-on.
      </footer>
    </main>
  );
}
