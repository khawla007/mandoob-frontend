import Link from 'next/link';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <Link href="/" className="text-lg font-semibold">
          Mandoob
        </Link>
        <nav className="flex gap-6 text-sm">
          <Link href="/pricing">Pricing</Link>
          <Link href="/login">Sign in</Link>
          <Link href="/register" className="font-medium">
            Get started
          </Link>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t px-6 py-4 text-sm text-zinc-500">
        &copy; {new Date().getFullYear()} Mandoob. UAE company registration & PRO management.
      </footer>
    </div>
  );
}
