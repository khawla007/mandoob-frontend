import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="text-muted-foreground border-t px-6 py-6 text-sm">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p>&copy; {new Date().getFullYear()} Mandoob. UAE company registration & PRO management.</p>
        <nav aria-label="Footer navigation" className="flex flex-wrap gap-4">
          <Link href="/knowledge-base" className="hover:text-foreground">
            Knowledge Base
          </Link>
          <Link href="/estimate" className="hover:text-foreground">
            Estimate
          </Link>
          <Link href="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <Link href="/legal/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/legal/terms" className="hover:text-foreground">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
