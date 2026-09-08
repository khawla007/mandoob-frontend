'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowUpRight,
  BadgeCheck,
  BookOpenText,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  FileText,
  KeyRound,
  LifeBuoy,
  LockKeyhole,
  ShieldCheck,
  UserRoundPlus,
} from 'lucide-react';
import {
  variantForPath,
  type AuthExperienceVariant,
} from '@/components/auth/auth-experience-route';

type AuthExperienceProps = {
  children: ReactNode;
  variant?: AuthExperienceVariant;
};

const narrativeIcons = {
  login: [ClipboardCheck, FileText, KeyRound, LifeBuoy],
  register: [UserRoundPlus, ClipboardCheck, BadgeCheck, CircleHelp],
  sensitive: [ShieldCheck, LockKeyhole, Clock3, LifeBuoy],
} as const;

const supportItems = [
  {
    icon: UserRoundPlus,
    id: 'register',
    href: '/register',
  },
  {
    icon: ClipboardCheck,
    id: 'estimate',
    href: '/estimate',
  },
  {
    icon: BookOpenText,
    id: 'knowledge',
    href: '/knowledge-base',
  },
  {
    icon: CircleHelp,
    id: 'contact',
    href: '/contact',
  },
] as const;

export function AuthExperience({ children, variant }: AuthExperienceProps) {
  const pathname = usePathname();
  const t = useTranslations('auth.experience');
  const resolvedVariant = variant ?? variantForPath(pathname);
  const icons = narrativeIcons[resolvedVariant];
  const tx = (key: string) => t(key as Parameters<typeof t>[0]);

  return (
    <div className={`auth-experience auth-experience--${resolvedVariant}`}>
      <section className="auth-experience__stage" aria-label={t('stageLabel')}>
        <div className="auth-experience__form-column">
          <div className="auth-experience__card">{children}</div>
        </div>

        <aside className="auth-experience__narrative" aria-labelledby="auth-narrative-title">
          <Image
            className="auth-experience__skyline"
            src="/hero/skyline.webp"
            alt=""
            fill
            priority
            sizes="(min-width: 1100px) 48vw, 100vw"
          />
          <div className="auth-experience__veil" aria-hidden="true" />
          <div className="auth-experience__narrative-content">
            <span className="eyebrow eyebrow--accent">{tx(`${resolvedVariant}.eyebrow`)}</span>
            <h2 id="auth-narrative-title">{tx(`${resolvedVariant}.title`)}</h2>
            <p className="auth-experience__intro">{tx(`${resolvedVariant}.description`)}</p>
            <ul className="auth-benefits" aria-label={t('benefitsLabel')}>
              {icons.map((Icon, index) => {
                const item = index + 1;
                return (
                  <li key={item}>
                    <span className="auth-benefits__icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <span>
                      <strong>{tx(`${resolvedVariant}.benefits.${item}.title`)}</strong>
                      <small>{tx(`${resolvedVariant}.benefits.${item}.body`)}</small>
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="auth-experience__privacy">
              <ShieldCheck aria-hidden="true" />
              <span>
                {tx(`${resolvedVariant}.privacyNote`)}{' '}
                <Link href="/legal/privacy">{t('privacyLink')}</Link>
              </span>
            </p>
          </div>
        </aside>
      </section>

      <section className="auth-support" aria-labelledby="auth-support-title">
        <h2 id="auth-support-title" className="visually-hidden">
          {t('supportLabel')}
        </h2>
        <ul>
          {supportItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <Icon aria-hidden="true" />
                <div>
                  <h3>{tx(`support.${item.id}.title`)}</h3>
                  <p>{tx(`support.${item.id}.body`)}</p>
                  <Link href={item.href}>
                    {tx(`support.${item.id}.label`)} <ArrowUpRight aria-hidden="true" />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
