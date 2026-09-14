'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isPublicNavCurrent, type PublicNavLink } from './public-navigation';
import { PublicLinkPendingIndicator } from './PublicLinkPendingIndicator';

type PublicNavLinksProps = {
  links: readonly PublicNavLink[];
  className?: string;
  onNavigate?: () => void;
};

export function PublicNavLinks({ links, className, onNavigate }: PublicNavLinksProps) {
  const pathname = usePathname();

  return (
    <div className={className}>
      {links.map((link) => (
        <Link
          key={link.id}
          href={link.href}
          aria-current={isPublicNavCurrent(link.currentPath, pathname) ? 'page' : undefined}
          onClick={() => onNavigate?.()}
        >
          {link.label}
          <PublicLinkPendingIndicator />
        </Link>
      ))}
    </div>
  );
}
