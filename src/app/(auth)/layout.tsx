import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-public flex min-h-screen flex-col">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        <section className="section">
          <div className="container">
            <div className="auth-shell">
              <div className="auth-card">{children}</div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
