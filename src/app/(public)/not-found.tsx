import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PublicNotFound() {
  return (
    <section className="public-content-state">
      <div className="public-content-state__inner container">
        <span className="eyebrow">404</span>
        <h1>Page not found</h1>
        <p>The public page you requested is missing or is not published.</p>
        <Link className="btn btn--accent" href="/">
          Return home
        </Link>
      </div>
    </section>
  );
}
