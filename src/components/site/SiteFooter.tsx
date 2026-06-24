import Link from 'next/link';

const cols = [
  {
    heading: 'Product',
    links: [
      { href: '/estimate', label: 'Estimator' },
      { href: '/#pro-suite', label: 'Platform' },
      { href: '/#why-h', label: 'White-label' },
      { href: '/pricing', label: 'Pricing' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/knowledge-base', label: 'Knowledge Base' },
      { href: '/contact', label: 'Contact' },
      { href: '/#flow', label: 'How it works' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { href: '/legal/privacy', label: 'Privacy' },
      { href: '/legal/terms', label: 'Terms' },
      { href: '/legal/pdpl', label: 'PDPL Statement' },
      { href: '/legal/trust', label: 'Trust Center' },
    ],
  },
];

export function SiteFooter() {
  return (
    <div className="site-public">
      <footer className="footer" role="contentinfo">
        <div className="footer__grid container">
          <div className="footer__brand">
            <Link href="/" className="nav__brand" aria-label="Mandoob home">
              <span className="nav__mark" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 26 26">
                  <rect x="1.5" y="1.5" width="23" height="23" rx="5" fill="#000" />
                  <path
                    d="M8 18V8l5 5 5-5v10"
                    stroke="#fff"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="nav__brandName">Mandoob</span>
            </Link>
            <p className="footer__tag">
              The UAE business registration and PRO management platform. Built by Fanatic Coders.
            </p>
            <p className="footer__addr mono">Downtown Dubai · United Arab Emirates</p>
          </div>

          {cols.map((col) => (
            <nav key={col.heading} className="footer__col" aria-label={col.heading}>
              <h3>{col.heading}</h3>
              <ul>
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link href={l.href}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="footer__rule" aria-hidden="true" />
        <div className="footer__bottom container">
          <p className="micro mono">
            © {new Date().getFullYear()} Mandoob by Fanatic Coders · Trade Licence #1234567
          </p>
          <div className="footer__meta">
            <span className="mono footer__badges">
              PDPL · ISO 27001 · TLS 1.3 · SOC 2 in progress
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
