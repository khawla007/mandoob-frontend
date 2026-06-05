import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-public reveal-on flex min-h-screen flex-col">
      {/* SSR HTML already carries reveal-on so .reveal items are hidden from
          first paint before the React-safe reveal controller mounts. */}
      <noscript>
        <style>{`.site-public .reveal,.site-public .rise__i{opacity:1!important;transform:none!important;}`}</style>
      </noscript>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
