'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { isPublicNavCurrent, type PublicNavLink } from './public-navigation';
import { PublicLinkPendingIndicator } from './PublicLinkPendingIndicator';

type PublicNavLinksProps = {
  links: readonly PublicNavLink[];
  className?: string;
  onNavigate?: () => void;
  /** `stacked` renders dropdown children inline (mobile dialog). */
  variant?: 'inline' | 'stacked';
};

type NavGroupProps = {
  link: PublicNavLink & { children: NonNullable<PublicNavLink['children']> };
  pathname: string;
  onNavigate?: () => void;
};

function NavDropdown({ link, pathname, onNavigate }: NavGroupProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const isCurrent = link.children.some((child) => isPublicNavCurrent(child.currentPath, pathname));

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="nav-dropdown"
      data-open={open ? 'true' : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="nav-dropdown__trigger"
        aria-expanded={open}
        aria-controls={menuId}
        data-current={isCurrent ? 'true' : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {link.label}
        <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
      </button>
      <ul id={menuId} className="nav-dropdown__menu" hidden={!open}>
        {link.children.map((child) => (
          <li key={child.id}>
            <Link
              href={child.href}
              aria-current={isPublicNavCurrent(child.currentPath, pathname) ? 'page' : undefined}
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
            >
              {child.label}
              <PublicLinkPendingIndicator />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NavGroupStacked({ link, pathname, onNavigate }: NavGroupProps) {
  return (
    <div className="nav-group-stacked" role="group" aria-label={link.label}>
      <span className="nav-group-stacked__label">{link.label}</span>
      {link.children.map((child) => (
        <Link
          key={child.id}
          href={child.href}
          aria-current={isPublicNavCurrent(child.currentPath, pathname) ? 'page' : undefined}
          onClick={() => onNavigate?.()}
        >
          {child.label}
          <PublicLinkPendingIndicator />
        </Link>
      ))}
    </div>
  );
}

export function PublicNavLinks({
  links,
  className,
  onNavigate,
  variant = 'inline',
}: PublicNavLinksProps) {
  const pathname = usePathname();

  return (
    <div className={className}>
      {links.map((link) => {
        if (link.children && link.children.length > 0) {
          const groupLink = { ...link, children: link.children };
          return variant === 'stacked' ? (
            <NavGroupStacked
              key={link.id}
              link={groupLink}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ) : (
            <NavDropdown
              key={link.id}
              link={groupLink}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          );
        }
        return (
          <Link
            key={link.id}
            href={link.href}
            aria-current={isPublicNavCurrent(link.currentPath, pathname) ? 'page' : undefined}
            onClick={() => onNavigate?.()}
          >
            {link.label}
            <PublicLinkPendingIndicator />
          </Link>
        );
      })}
    </div>
  );
}
