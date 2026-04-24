import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted/30 relative flex min-h-screen items-center justify-center px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,oklch(0.62_0.19_259/0.10),transparent_70%)]"
      />
      <div className="bg-card w-full max-w-md rounded-lg border p-8 shadow-xs">
        <Link
          href="/"
          className="text-foreground mb-6 inline-block text-lg font-semibold tracking-tight"
        >
          Mandoob
        </Link>
        {children}
      </div>
    </div>
  );
}
