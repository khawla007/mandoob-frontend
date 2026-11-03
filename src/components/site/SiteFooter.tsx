import 'server-only';
import Link from 'next/link';
import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

/** Design HTML demo contact details (owner-approved placeholder, 2026-11). */
const CONTACT_PHONE_E164 = '+971501234567';
const CONTACT_PHONE_DISPLAY = '+971 50 123 4567';
const CONTACT_EMAIL = 'info@uaebusinesssetup.ae';

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
      heading: tFooter('businessSetup'),
      links: [
        { href: '/mainland', label: tFooter('mainland') },
        { href: '/free-zones', label: tFooter('freeZones') },
        { href: '/offshore', label: tFooter('offshore') },
        { href: '/estimate', label: tFooter('costEstimator') },
        { href: '/business-registration', label: tFooter('businessRegistration') },
      ],
    },
    {
      heading: tFooter('resources'),
      links: [
        { href: '/knowledge-base', label: tFooter('knowledgeBase') },
        { href: '/guides', label: tFooter('guides') },
        { href: '/document-requirements', label: tFooter('documentRequirements') },
        { href: '/faq', label: tFooter('faq') },
        { href: '/blog', label: tFooter('blog') },
      ],
    },
    {
      heading: tFooter('company'),
      links: [
        { href: '/about', label: tFooter('aboutUs') },
        { href: '/contact', label: tFooter('contactUs') },
        { href: '/legal/privacy', label: tFooter('privacyPolicy') },
        { href: '/legal/terms', label: tFooter('termsConditions') },
      ],
    },
  ];
  const legalLinks = [
    { href: '/legal/pdpl', label: tFooter('pdpl') },
    { href: '/legal/trust', label: tFooter('trustCenter') },
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

          <div className="footer__col footer__contact">
            <h2>{tFooter('getInTouch')}</h2>
            <ul>
              <li>
                <Phone aria-hidden="true" />
                <a href={`tel:${CONTACT_PHONE_E164}`} dir="ltr">
                  {CONTACT_PHONE_DISPLAY}
                </a>
              </li>
              <li>
                <Mail aria-hidden="true" />
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              </li>
              <li className="footer__whatsapp">
                <MessageCircle aria-hidden="true" />
                <a
                  href={`https://wa.me/${CONTACT_PHONE_E164.slice(1)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {tFooter('whatsapp')}
                </a>
              </li>
              <li className="footer__address">
                <MapPin aria-hidden="true" />
                <span className="footer__addr">
                  {tFooter('addressLine1')}
                  <br />
                  {tFooter('addressLine2')}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer__rule" aria-hidden="true" />
        <div className="footer__bottom container">
          <p className="micro mono">
            © {year} {tFooter('identity')}
          </p>
          <nav className="footer__legal" aria-label={tFooter('legalLabel')}>
            {legalLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
