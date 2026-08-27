import 'server-only';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';

function BrandMark() {
  return (
    <span className="nav__mark" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 26 26">
        <rect x="1.5" y="1.5" width="23" height="23" rx="5" fill="var(--public-text-primary)" />
        <path
          d="M8 18V8l5 5 5-5v10"
          stroke="var(--public-canvas)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export async function SiteFooter() {
  const [tFooter, tSite, locale] = await Promise.all([
    getTranslations('site.footer'),
    getTranslations('site'),
    getLocale(),
  ]);
  const year = new Intl.NumberFormat(locale, { useGrouping: false }).format(
    new Date().getFullYear(),
  );
  const columns = [
    {
      heading: tFooter('product'),
      links: [
        { href: '/estimate', label: tFooter('estimator') },
        { href: '/apply', label: tFooter('startApplication') },
        { href: '/pro', label: tFooter('forPros') },
        { href: '/pricing', label: tFooter('pricing') },
      ],
    },
    {
      heading: tFooter('company'),
      links: [
        { href: '/about', label: tFooter('about') },
        { href: '/knowledge-base', label: tFooter('knowledgeBase') },
        { href: '/contact', label: tFooter('contact') },
        { href: '/#flow', label: tFooter('howItWorks') },
      ],
    },
    {
      heading: tFooter('legal'),
      links: [
        { href: '/legal/privacy', label: tFooter('privacy') },
        { href: '/legal/terms', label: tFooter('terms') },
        { href: '/legal/pdpl', label: tFooter('pdpl') },
        { href: '/legal/trust', label: tFooter('trustCenter') },
      ],
    },
  ];

  return (
    <div className="site-public">
      <footer className="footer">
        <div className="footer__grid container">
          <div className="footer__brand">
            <Link href="/" className="nav__brand" aria-label={tSite('brandHome')}>
              <BrandMark />
              <span className="nav__brandName">Mandoob</span>
            </Link>
            <p className="footer__tag">{tFooter('description')}</p>
            <p className="footer__addr mono">{tFooter('location')}</p>
          </div>

          {columns.map((column) => (
            <nav key={column.heading} className="footer__col" aria-label={column.heading}>
              <h2>{column.heading}</h2>
              <ul>
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="footer__rule" aria-hidden="true" />
        <div className="footer__bottom container">
          <p className="micro mono">
            © {year} {tFooter('identity')}
          </p>
        </div>
      </footer>
    </div>
  );
}
