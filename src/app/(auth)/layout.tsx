import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="bg-muted/30 relative flex flex-1 items-center justify-center px-4 py-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,oklch(0.62_0.19_259/0.10),transparent_70%)]"
        />
        <div className="bg-card w-full max-w-md rounded-lg border p-8 shadow-xs">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
