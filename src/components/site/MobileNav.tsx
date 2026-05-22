'use client';

import { useState } from 'react';
import Link from 'next/link';

type NavLink = { href: string; label: string };

export function MobileNav({
  links,
  authed,
  signInLabel,
  ctaLabel,
}: {
  links: NavLink[];
  authed: boolean;
  signInLabel: string;
  ctaLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="nav__menu"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 7h16M4 12h16M4 17h16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open ? (
        <div className="nav__mobile">
          <nav className="nav__mobileLinks" aria-label="Mobile">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
            {!authed ? (
              <>
                <Link href="/login" onClick={() => setOpen(false)}>
                  {signInLabel}
                </Link>
                <Link
                  className="btn btn--accent btn--sm"
                  href="/estimate"
                  onClick={() => setOpen(false)}
                >
                  {ctaLabel}
                </Link>
              </>
            ) : null}
          </nav>
        </div>
      ) : null}
    </>
  );
}
